using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RT.Serialization;
using RT.Util.ExtensionMethods;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

class WeatherForecastBlockConfig
{
    public string BbcLocationCode { get; set; }
    public string CachePath { get; set; } = null;
    public string DumpPath { get; set; } = null;
}

class WeatherForecastBlockServer : SimpleBlockServerBase<WeatherForecastBlockDto>
{
    private WeatherForecastBlockConfig _config;
    private HttpClient _httpClient = new();
    private Dictionary<DateTime, WeatherForecastHourDto> _recentHours = new(); // the API does not return predictions for today that are now in the past but we want to chart them

    public WeatherForecastBlockServer(IServiceProvider sp, WeatherForecastBlockConfig config)
        : base(sp, TimeSpan.FromMinutes(30))
    {
        _config = config;
    }

    public override void Start()
    {
        if (_config.CachePath != null)
            if (File.Exists(_config.CachePath))
                _recentHours = ClassifyXml.DeserializeFile<Dictionary<DateTime, WeatherForecastHourDto>>(_config.CachePath);
        base.Start();
    }

    protected override bool ShouldTick() => true;

    protected override WeatherForecastBlockDto Tick()
    {
        var result = _httpClient.GetAsync($"https://weather-broker-cdn.api.bbci.co.uk/en/forecast/aggregated/{_config.BbcLocationCode}").GetAwaiter().GetResult();
        if (!result.IsSuccessStatusCode)
            throw new TellUserException($"Forecast server is down ({(int)result.StatusCode})");

        var content = result.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        var json = JObject.Parse(content);

        var dto = new WeatherForecastBlockDto { ValidUntilUtc = DateTime.UtcNow + TimeSpan.FromMinutes(60) };
        dto.Days = json["forecasts"]
            .OfType<JObject>()
            .Select(j => GetDayForecast((JObject)j["summary"]["report"]))
            .ToArray();

        foreach (var day in json["forecasts"].OfType<JObject>())
            foreach (var hour in (JArray)day["detailed"]["reports"])
            {
                var hdto = GetHourForecast((JObject)hour);
                _recentHours[hdto.DateTime] = hdto;
            }
        _recentHours.RemoveAllByKey(d => d < DateTime.Today.AddDays(-1));
        dto.Hours = _recentHours.Values.Where(h => h.DateTime.Date <= DateTime.Today.AddDays(2)).OrderBy(h => h.DateTime).ToArray();

        if (_config.CachePath != null)
            ClassifyXml.SerializeToFile(_recentHours, _config.CachePath);
        if (_config.DumpPath != null)
        {
            var issue = json["issueDate"].ToString(Formatting.None).Replace(":", ".").Replace("\"", "");
            var lastUpdated = json["lastUpdated"].ToString(Formatting.None).Replace(":", ".").Replace("\"", "");
            var dumpFile = Path.Combine(_config.DumpPath, $"{_config.BbcLocationCode}--{issue}--{lastUpdated}.json");
            if (!File.Exists(dumpFile))
                File.WriteAllText(dumpFile, content);
        }

        return dto;
    }

    private static Dictionary<int, int> _nighttimeMap = new()
    {
        [0] = 1, // 'clear-sky-night', 'sunny-day'
        [2] = 3, // 'partly-cloudy-night', 'sunny-intervals-day'
        [9] = 10, // 'light-rain-shower-night', 'light-rain-shower-day'
        [13] = 14, // 'heavy-rain-shower-night', 'heavy-rain-shower-day'
        [16] = 17, // 'sleet-shower-night', 'sleet-shower-day'
        [19] = 20, // 'hail-shower-night', 'hail-shower-day'
        [22] = 23, // 'light-snow-shower-night', 'light-snow-shower-day'
        [25] = 26, // 'heavy-snow-shower-night', 'heavy-snow-shower-day'
        [28] = 29, // 'thunderstorm-shower-night', 'thunderstorm-shower-day'
        [33] = 4, // 'sandstorm-night', 'sandstorm-day'
        [34] = 5, // 'mist-night', 'mist-day'
        [35] = 6, // 'fog-night', 'fog-day'
        [36] = 7, // 'white-cloud-night', 'white-cloud-day'
        [37] = 8, // 'thick-cloud-night', 'thick-cloud-day'
        [38] = 11, // 'drizzle-night', 'drizzle-day'
        [39] = 12, // 'light-rain-night', 'light-rain-day'
        [40] = 15, // 'heavy-rain-night', 'heavy-rain-day'
        [41] = 18, // 'sleet-night', 'sleet-day'
        [42] = 21, // 'hail-night', 'hail-day'
        [43] = 24, // 'light-snow-night', 'light-snow-day'
        [44] = 27, // 'heavy-snow-night', 'heavy-snow-day'
        [45] = 30, // 'thunderstorm-night', 'thunderstorm-day'
        [46] = 31, // 'tropicalstorm-night', 'tropicalstorm-day'
        [47] = 32, // 'hazy-night', 'hazy-day'
    };

    private WeatherForecastDayDto GetDayForecast(JObject json)
    {
        var localDate = (string)json["localDate"] ?? "";
        var minTempC = (int?)json["minTempC"] ?? -99;
        var maxTempC = (int?)json["maxTempC"] ?? -99;
        var precipitationProbability = (int?)json["precipitationProbabilityInPercent"] ?? -99;
        var windSpeedMph = (int?)json["windSpeedMph"] ?? -99;
        var gustSpeedMph = (int?)json["gustSpeedMph"] ?? -99;
        var weatherType = (int?)json["weatherType"] ?? 0;

        var result = new WeatherForecastDayDto
        {
            Date = localDate,
            TempMinC = minTempC,
            TempMaxC = maxTempC,
            RainProbability = precipitationProbability,
            WindMph = windSpeedMph,
            GustMph = gustSpeedMph,
            WeatherKind = (WeatherForecastKindDte)weatherType,
        };
        if (_nighttimeMap.TryGetValue((int)result.WeatherKind, out var dayKind))
        {
            result.Night = true;
            result.WeatherKind = (WeatherForecastKindDte)dayKind;
        }
        if (!Enum.IsDefined(result.WeatherKind))
            throw new Exception($"Unknown weather kind: {(int)result.WeatherKind}");
        return result;
    }

    private WeatherForecastHourDto GetHourForecast(JObject json)
    {
        return new WeatherForecastHourDto
        {
            DateTime = DateTime.Parse(json["localDate"].Value<string>() + "T" + json["timeslot"].Value<string>() + ":00"),
            RainProbability = json["precipitationProbabilityInPercent"].Value<int>(),
        };
    }
}
