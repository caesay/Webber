using System.Text.RegularExpressions;
using Dapper;
using Dapper.Contrib.Extensions;
using Innovative.SolarCalculator;
using RT.Util.ExtensionMethods;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

class WeatherBlockConfig
{
    public double Longitude { get; set; } // degrees, east is positive
    public double Latitude { get; set; } // degrees, north is positive
}

class WeatherBlockServer : SimpleBlockServerBase<WeatherBlockDto>
{
    private WeatherBlockConfig _config;
    private IDbService _db;
    private Dictionary<DateTime, decimal> _temperatures = new();
    private HttpClient _httpClient = new();

    public WeatherBlockServer(IServiceProvider sp, WeatherBlockConfig config, IDbService db)
        : base(sp, TimeSpan.FromMinutes(1))
    {
        _config = config;
        _db = db;
        registerMigrations();
    }

    public override void Start(CancellationToken cancellationToken = default)
    {
        if (_db.Enabled)
            using (var conn = _db.OpenConnection())
            {
                _temperatures = conn.Query<TbWeatherTemperature>(
                    $@"SELECT * FROM {nameof(TbWeatherTemperature)} WHERE {nameof(TbWeatherTemperature.Timestamp)} > @limit",
                    new { limit = DateTime.UtcNow.AddDays(-8).ToDbDateTime() }
                ).ToDictionary(r => r.Timestamp.FromDbDateTime(), r => (decimal)r.Temperature);
            }

        base.Start(cancellationToken);
    }

    protected override bool ShouldTick() => true;

    protected override WeatherBlockDto Tick()
    {
        var result = _httpClient.GetAsync("https://www.cl.cam.ac.uk/research/dtg/weather/current-obs.txt").GetAwaiter().GetResult();
        if (!result.IsSuccessStatusCode)
            throw new TellUserException($"Weather server is down ({(int)result.StatusCode})");
        var content = result.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        var datetime = Regex.Match(content, @"at (?<time>\d+:\d\d (AM|PM)) on (?<date>\d+ \w\w\w \d\d):");
        if (!datetime.Success)
            throw new TellUserException("Weather server is down");
        var dt = DateTime.ParseExact(datetime.Groups["date"].Value + "@" + datetime.Groups["time"].Value, "dd MMM yy'@'h:mm tt", null);
        var curTemp = decimal.Parse(Regex.Match(content, @"Temperature:\s+(?<temp>-?\d+(\.\d)?) C").Groups["temp"].Value);

        _temperatures.RemoveAllByKey(date => date < DateTime.UtcNow - TimeSpan.FromDays(8));
        _temperatures[DateTime.UtcNow] = curTemp;

        if (_db.Enabled)
            using (var conn = _db.OpenConnection())
                conn.Insert(new TbWeatherTemperature { Timestamp = DateTime.UtcNow.ToDbDateTime(), Temperature = (double)curTemp });

        var dto = new WeatherBlockDto { ValidUntilUtc = DateTime.UtcNow + TimeSpan.FromMinutes(30) };

        dto.CurTemperature = _temperatures.Where(kvp => kvp.Key >= DateTime.UtcNow.AddMinutes(-15)).Average(kvp => kvp.Value);

        var temps = _temperatures.OrderBy(kvp => kvp.Key).ToList();
        var avg = temps.Select(kvp => (time: kvp.Key, temp: temps.Where(x => x.Key >= kvp.Key.AddMinutes(-7.5) && x.Key <= kvp.Key.AddMinutes(7.5)).Average(x => x.Value))).ToList();

        var min = findExtreme(avg, 5, seq => seq.MinElement(x => x.temp));
        dto.MinTemperature = min.temp;
        dto.MinTemperatureAtTime = $"{min.time.ToLocalTime():HH:mm}";
        dto.MinTemperatureAtDay = min.time.ToLocalTime().Date == DateTime.Today ? "today" : "yesterday";

        var max = findExtreme(avg, 12, seq => seq.MaxElement(x => x.temp));
        dto.MaxTemperature = max.temp;
        dto.MaxTemperatureAtTime = $"{max.time.ToLocalTime():HH:mm}";
        dto.MaxTemperatureAtDay = max.time.ToLocalTime().Date == DateTime.Today ? "today" : "yesterday";

        dto.CurTemperatureColor = getTemperatureColor(dto.CurTemperature, getTemperatureDeviation(DateTime.Now, TimeSpan.FromHours(1), avg));
        dto.MinTemperatureColor = getTemperatureColor(min.temp, getTemperatureDeviation(min.time.ToLocalTime(), TimeSpan.FromHours(1), avg));
        dto.MaxTemperatureColor = getTemperatureColor(max.temp, getTemperatureDeviation(max.time.ToLocalTime(), TimeSpan.FromHours(1), avg));
        var high = getTemperatureDeviation(DateTime.Today.AddHours(14), TimeSpan.FromHours(3), avg);
        var low = getTemperatureDeviation(DateTime.Today.AddHours(4.5), TimeSpan.FromHours(3), avg);
        double? nanNull(double v) => double.IsNaN(v) ? null : v;
        dto.RecentHighTempMean = nanNull(high.mean);
        dto.RecentHighTempStdev = nanNull(high.stdev);
        dto.RecentLowTempMean = nanNull(low.mean);
        dto.RecentLowTempStdev = nanNull(low.stdev);

        PopulateSunriseSunset(dto, DateTime.Today);

        return dto;
    }

    private void PopulateSunriseSunset(WeatherBlockDto dto, DateTime today)
    {
        var timesToday = new SolarTimes(DateTimeOffset.Now, _config.Latitude, _config.Longitude);
        var timesTomorrow = new SolarTimes(DateTimeOffset.Now.AddDays(1), _config.Latitude, _config.Longitude);
        dto.SunriseTime = $"{timesToday.Sunrise:HH:mm}";
        dto.SolarNoonTime = $"{timesToday.SolarNoon:HH:mm}";
        dto.SunsetTime = $"{timesToday.Sunset:HH:mm}";
        var sunsetDelta = timesTomorrow.Sunset.AddDays(-1) - timesToday.Sunset;
        dto.SunsetDeltaTime = (sunsetDelta >= TimeSpan.Zero ? "+" : "−") + $"{Math.Abs(sunsetDelta.TotalMinutes):0.0}m";
        dto.SunriseUtc = timesToday.Sunrise.ToUniversalTime();
        dto.SunsetUtc = timesToday.Sunset.ToUniversalTime();
        dto.Sunrise2Utc = timesTomorrow.Sunrise.ToUniversalTime();
        dto.Sunset2Utc = timesTomorrow.Sunset.ToUniversalTime();
    }

    private (DateTime time, decimal temp) findExtreme(List<(DateTime time, decimal temp)> seq, int todayLimit, Func<IEnumerable<(DateTime time, decimal temp)>, (DateTime time, decimal temp)> getExtreme)
    {
        var today = DateTime.Today;
        var yesterday = DateTime.Today.AddDays(-1);
        var seqToday = seq.Where(s => s.time.ToLocalTime().Date == today).Reverse();
        var seqYesterday = seq.Where(s => s.time.ToLocalTime().Date == yesterday).Reverse();
        var result = getExtreme(seqToday);
        if ((result.time > DateTime.UtcNow.AddHours(-2) || DateTime.Now.Hour <= todayLimit) && seqYesterday.Any())
            return getExtreme(seqYesterday);
        else
            return result;
    }

    internal static (double mean, double stdev) getTemperatureDeviation(DateTime tempTime, TimeSpan range, List<(DateTime time, decimal temp)> avg)
    {
        var center = tempTime.ToLocalTime().AddDays(-1);
        var prevTempsAtSameTime = avg.Take(0).ToList(); // empty list of same type
        while (center.ToUniversalTime() > avg[0].time)
        {
            var from = center - range / 2;
            var to = center + range / 2;
            var match = avg.Where(pt => pt.time >= from.ToUniversalTime() && pt.time <= to.ToUniversalTime()).MinElementOrDefault(pt => Math.Abs((pt.time - center.ToUniversalTime()).TotalSeconds));
            if (match.time != default(DateTime))
                prevTempsAtSameTime.Add(match);
            center = center.AddDays(-1);
        }
        if (prevTempsAtSameTime.Count >= 3)
        {
            var mean = (double)prevTempsAtSameTime.Average(pt => pt.temp);
            var stdev = Math.Sqrt(prevTempsAtSameTime.Sum(pt => ((double)pt.temp - mean) * ((double)pt.temp - mean)) / (prevTempsAtSameTime.Count - 1));
            return (mean, stdev);
        }
        else
            return (double.NaN, double.NaN);
    }

    internal static string getTemperatureColor(decimal temp, (double mean, double stdev) p)
    {
        int blend(int c1, int c2, double pos) => (int)Math.Round(c1 * pos + c2 * (1 - pos));
        ValueTuple<int, int, int> blend3(ValueTuple<int, int, int> c1, ValueTuple<int, int, int> c2, double pos) => (blend(c1.Item1, c2.Item1, pos), blend(c1.Item2, c2.Item2, pos), blend(c1.Item3, c2.Item3, pos));
        var color = (0xDF, 0x72, 0xFF); // purple = can't color by deviation
        if (!double.IsNaN(p.mean))
        {
            var cur = (double)temp;
            var coldest = (0x2F, 0x9E, 0xFF);
            var warmest = (0xFF, 0x5D, 0x2F);
            if (cur < p.mean - p.stdev)
                color = coldest;
            else if (cur > p.mean + p.stdev)
                color = warmest;
            else
                color = blend3(warmest, coldest, (cur - (p.mean - p.stdev)) / (2 * p.stdev));
        }
        return $"#{color.Item1:X2}{color.Item2:X2}{color.Item3:X2}";
    }

    private void registerMigrations()
    {
        if (!_db.Enabled)
            return;
        _db.RegisterMigration("WeatherService", 0, 1, (conn, trn) =>
        {
            conn.Execute($@"CREATE TABLE {nameof(TbWeatherTemperature)} (
                    {nameof(TbWeatherTemperature.Timestamp)} INTEGER PRIMARY KEY,
                    {nameof(TbWeatherTemperature.Temperature)} REAL NOT NULL
                )", transaction: trn);
        });
    }

    internal class TbWeatherTemperature
    {
        [ExplicitKey]
        public long Timestamp { get; set; }
        public double Temperature { get; set; }
    }
}
