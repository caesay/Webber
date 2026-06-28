using System.Text;
using Dapper;
using Dapper.Contrib.Extensions;
using Microsoft.Data.Sqlite;
using RT.Util;
using RT.Util.Collections;
using RT.Util.ExtensionMethods;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

class HttpingBlockConfig
{
    public List<Target> Targets { get; set; } = new();

    public class Target
    {
        public string Name { get; set; } = "Google"; // displayed
        public string InternalName { get; set; } = "Google"; // stored in db
        public string Url { get; set; } = "https://www.google.com";
        public TimeSpan Interval { get; set; } = TimeSpan.FromSeconds(5);
        public string MustContain { get; set; } = "";
        public string TimeZone { get; set; } = "GMT Standard Time";

        public override string ToString() => $"{Name} ({Url})";
    }
}

class HttpingBlockServer : SimpleBlockServerBase<HttpingBlockDto>
{
    private HttpingBlockConfig _config;
    private IDbService _db;
    private PingBlockServer _pingSvc;
    private List<HttpingTarget> _targets;
    private ILogger _logger;
    private CancellationTokenSource _targetsCts;

    public override Type ConfigType => typeof(HttpingBlockConfig);
    public override void UpdateConfig(object newConfig) => _config = (HttpingBlockConfig)newConfig;

    public HttpingBlockServer(IServiceProvider sp, HttpingBlockConfig config, IDbService db, PingBlockServer pingSvc, ILogger<HttpingBlockServer> logger)
        : base(sp, 5000)
    {
        _config = config;
        _db = db;
        _pingSvc = pingSvc;
        _logger = logger;
        if (!_db.Enabled)
            throw new Exception("This service requires a database.");
        registerMigrations();
    }

    public override async Task StopAsync()
    {
        _targetsCts?.Cancel();
        await base.StopAsync();
    }

    public override void Start(CancellationToken cancellationToken = default)
    {
        _targetsCts?.Cancel();
        _targetsCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _targets = _config.Targets.Select(ts => new HttpingTarget { Settings = ts }).ToList();
        foreach (var tgt in _targets)
            tgt.Start(this, _targetsCts.Token);
        base.Start(cancellationToken);
    }

    protected override HttpingBlockDto Tick()
    {
        var dto = new HttpingBlockDto { ValidUntilUtc = DateTime.UtcNow + TimeSpan.FromSeconds(15) };
        dto.Targets = new HttpingTargetDto[_targets.Count];
        int i = 0;
        foreach (var tgt in _targets)
        {
            lock (tgt.Lock)
            {
                var cutoff30m = DateTime.UtcNow.AddMinutes(-30).ToUnixSeconds();
                var cutoff24h = DateTime.UtcNow.AddHours(-24).ToUnixSeconds();
                var cutoff30d = DateTime.UtcNow.AddDays(-30).ToUnixSeconds();
                var stamps30m = new List<ushort>();
                var stamps24h = new List<ushort>();
                var stamps30d = new List<ushort>();
                var last30m = new HttpingIntervalDto();
                var last24h = new HttpingIntervalDto();
                var last30d = new HttpingIntervalDto();
                for (int k = tgt.Recent.Count - 1; k >= 0; k--)
                {
                    var pt = tgt.Recent[k];
                    if (pt.Timestamp > cutoff30m && CountSample(ref last30m, pt.MsResponse))
                        stamps30m.Add(pt.MsResponse);
                    if (pt.Timestamp > cutoff24h && CountSample(ref last24h, pt.MsResponse))
                        stamps24h.Add(pt.MsResponse);
                    if (pt.Timestamp > cutoff30d && CountSample(ref last30d, pt.MsResponse))
                        stamps30d.Add(pt.MsResponse);
                }
                stamps30m.Sort();
                stamps24h.Sort();
                stamps30d.Sort();
                SetPercentiles(ref last30m, stamps30m);
                SetPercentiles(ref last24h, stamps24h);
                SetPercentiles(ref last30d, stamps30d);

                var tgtdto = new HttpingTargetDto
                {
                    Name = tgt.Settings.Name,
                    Twominutely = GetIntervalDto(tgt.Twominutely, TimeSpan.FromMinutes(2), tgt.GetStartOfTwominute),
                    Hourly = GetIntervalDto(tgt.Hourly, TimeSpan.FromHours(1), tgt.GetStartOfHour),
                    Daily = GetIntervalDto(tgt.Daily, TimeSpan.FromHours(24), tgt.GetStartOfLocalDayInUtc),
                    Monthly = GetIntervalDto(tgt.Monthly, TimeSpan.FromDays(30), tgt.GetStartOfLocalMonthInUtc),
                    Last30m = last30m,
                    Last24h = last24h,
                    Last30d = last30d,
                };
                tgtdto.Recent = tgt.Recent.Select(pt => (int)pt.MsResponse).Skip(tgt.Recent.Count - 30).ToArray();

                dto.Targets[i] = tgtdto;
            }
            i++;
        }

        return dto;
    }

    private static bool CountSample(ref HttpingIntervalDto stat, ushort msResponse)
    {
        stat.TotalCount++;
        if (msResponse == 65535)
            stat.TimeoutCount++;
        else if (msResponse == 0)
            stat.ErrorCount++;
        else
            return true;
        return false;
    }

    private static void SetPercentiles(ref HttpingIntervalDto stat, List<ushort> sortedValues)
    {
        stat.MsResponsePrc01 = sortedValues.Count == 0 ? (ushort)0 : sortedValues[(sortedValues.Count - 1) * 1 / 100];
        stat.MsResponsePrc25 = sortedValues.Count == 0 ? (ushort)0 : sortedValues[(sortedValues.Count - 1) * 25 / 100];
        stat.MsResponsePrc50 = sortedValues.Count == 0 ? (ushort)0 : sortedValues[(sortedValues.Count - 1) * 50 / 100];
        stat.MsResponsePrc75 = sortedValues.Count == 0 ? (ushort)0 : sortedValues[(sortedValues.Count - 1) * 75 / 100];
        stat.MsResponsePrc95 = sortedValues.Count == 0 ? (ushort)0 : sortedValues[(sortedValues.Count - 1) * 95 / 100];
        stat.MsResponsePrc99 = sortedValues.Count == 0 ? (ushort)0 : sortedValues[(sortedValues.Count - 1) * 99 / 100];
    }

    private static HttpingIntervalDto[] GetIntervalDto(QueueViewable<HttpingPointInterval> data, TimeSpan interval, Func<DateTime, DateTime> getIntervalStart)
    {
        const int count = 30;
        var cur = getIntervalStart(getIntervalStart(DateTime.UtcNow) - interval);
        var result = new List<HttpingIntervalDto>();
        for (int i = data.Count - 1; i >= 0; i--)
        {
            var pt = data[i];
            if (pt.StartUtc > cur)
                continue;
            while (pt.StartUtc < cur && result.Count < count)
            {
                result.Add(new HttpingIntervalDto { TotalCount = 0 });
                cur = getIntervalStart(cur - interval);
            }
            if (result.Count >= count)
                break;
            Ut.Assert(pt.StartUtc == cur);
            result.Add(pt.ToDto());
            cur = getIntervalStart(cur - interval);
        }
        while (result.Count < count)
            result.Add(new HttpingIntervalDto { TotalCount = 0 });
        while (result.Count > count)
            result.RemoveRange(count, result.Count - count);
        result.Reverse();
        return result.ToArray();
    }

    public bool IsGoodInternetConnection()
    {
        // is ok if we have at least 4 pings in the last 30s, all of which are under 35 ms
        var pings = _pingSvc.RecentPings.Where(p => p.SentUtc >= DateTime.UtcNow.AddSeconds(-30));
        return pings.Count() >= 4 && pings.All(p => p.PingMs != null && p.PingMs < 35);
    }

    private void registerMigrations()
    {
        _db.RegisterMigration("HttpingService", 0, 1, (conn, trn) =>
        {
            conn.Execute(@"CREATE TABLE TbHttpingSite (
                    SiteId INTEGER PRIMARY KEY,
                    InternalName TEXT NOT NULL
                )");

            conn.Execute(@"CREATE TABLE TbHttpingRecent (
                    SiteId BIGINT NOT NULL,
                    Timestamp BIGINT NOT NULL,
                    MsResponse INT NOT NULL,
                    PRIMARY KEY (SiteId, Timestamp)
                )");

            conn.Execute(@"CREATE TABLE TbHttpingInterval (
                    SiteId BIGINT NOT NULL,
                    StartTimestamp BIGINT NOT NULL,
                    IntervalLength INT NOT NULL,

                    TotalCount INT NOT NULL,
                    TimeoutCount INT NOT NULL,
                    ErrorCount INT NOT NULL,

                    MsResponsePrc01 INT NOT NULL,
                    MsResponsePrc25 INT NOT NULL,
                    MsResponsePrc50 INT NOT NULL,
                    MsResponsePrc75 INT NOT NULL,
                    MsResponsePrc95 INT NOT NULL,
                    MsResponsePrc99 INT NOT NULL,

                    PRIMARY KEY (SiteId, StartTimestamp, IntervalLength)
                )");
        });
    }

    class HttpingTarget
    {
        public HttpingBlockConfig.Target Settings;

        public QueueViewable<HttpingPoint> Recent = new(); // must hold a month's worth in order to compute monthly percentiles
        public QueueViewable<HttpingPointInterval> Twominutely = new();
        public QueueViewable<HttpingPointInterval> Hourly = new();
        public QueueViewable<HttpingPointInterval> Daily = new();
        public QueueViewable<HttpingPointInterval> Monthly = new();

        private long _siteId;
        public TimeZoneInfo Timezone;
        public object Lock = new();
        private HttpingBlockServer _svc;
        private CancellationToken _ct;

        public override string ToString() => $"{Settings.Name} ({Settings.Url}) : {Recent.Count:#,0} recent, {Twominutely.Count:#,0} twomin, {Hourly.Count:#,0} hourly, {Daily.Count:#,0} daily, {Monthly.Count:#,0} monthly";

        public void Start(HttpingBlockServer svc, CancellationToken ct)
        {
            _svc = svc;
            _ct = ct;
            Timezone = TimeZoneInfo.FindSystemTimeZoneById(Settings.TimeZone);

            var start = DateTime.UtcNow;
            using var conn = _svc._db.OpenConnection();

            _siteId = conn.Query<TbHttpingSite>($"SELECT * FROM {nameof(TbHttpingSite)} WHERE {nameof(TbHttpingSite.InternalName)} = @name", new { name = Settings.InternalName }).SingleOrDefault()?.SiteId
                ?? conn.Insert(new TbHttpingSite { InternalName = Settings.InternalName });

            Recent = new QueueViewable<HttpingPoint>(conn.Query<TbHttpingRecent>($@"
                        SELECT *
                        FROM {nameof(TbHttpingRecent)}
                        WHERE {nameof(TbHttpingRecent.SiteId)} = @siteId AND {nameof(TbHttpingRecent.Timestamp)} >= @limit
                        ORDER BY {nameof(TbHttpingRecent.Timestamp)}",
                    new { siteId = _siteId, limit = DateTime.UtcNow.AddDays(-35).ToDbDateTime() })
                .Select(r => new HttpingPoint(r)));
            Twominutely = loadRecentIntervals(conn, HttpingIntervalLength.TwoMinutes);
            Hourly = loadRecentIntervals(conn, HttpingIntervalLength.Hour);
            Daily = loadRecentIntervals(conn, HttpingIntervalLength.Day);
            Monthly = loadRecentIntervals(conn, HttpingIntervalLength.Month);

            _svc._logger.LogInformation($"Loaded data for {Settings.InternalName} in {(DateTime.UtcNow - start).TotalSeconds:0.0} sec");

            new Thread(thread) { IsBackground = true }.Start();
        }

        private void recomputePercentiles()
        {
            using var conn = _svc._db.OpenConnection();
            Console.WriteLine($"Recomputing percentiles for site {_siteId}: loading data...");
            var allrecent = conn.Query<TbHttpingRecent>($@"
                        SELECT *
                        FROM {nameof(TbHttpingRecent)}
                        WHERE {nameof(TbHttpingRecent.SiteId)} = @siteId
                        ORDER BY {nameof(TbHttpingRecent.Timestamp)}",
                    new { siteId = _siteId })
                .Select(r => new HttpingPoint(r)).ToList();
            Console.WriteLine($"Loaded {allrecent.Count:#,0} datapoints. Comparing...");
            recomputePercentilesSingle(conn, allrecent, GetStartOfTwominute, HttpingIntervalLength.TwoMinutes);
            recomputePercentilesSingle(conn, allrecent, GetStartOfHour, HttpingIntervalLength.Hour);
            recomputePercentilesSingle(conn, allrecent, GetStartOfLocalDayInUtc, HttpingIntervalLength.Day);
            recomputePercentilesSingle(conn, allrecent, GetStartOfLocalMonthInUtc, HttpingIntervalLength.Month);
            Console.WriteLine($"Done.");
        }

        private void recomputePercentilesSingle(SqliteConnection conn, IEnumerable<HttpingPoint> points, Func<DateTime, DateTime> getStart, HttpingIntervalLength length)
        {
            foreach (var grp in points.GroupBy(pt => getStart(pt.Timestamp.FromUnixSeconds())).OrderBy(g => g.Key).Skip(1).SkipLast(1))
            {
                var interval = new HttpingPointInterval { StartUtc = grp.Key };

                var good = grp.Select(g => g.MsResponse).Where(ms => ms != 0 && ms != 65535).Order().ToList();
                if (good.Count > 0)
                    SetPercentiles(ref interval.MsResponse, good);
                foreach (var sample in grp)
                    interval.CountSample(sample.MsResponse);
                var existing = conn.Query<TbHttpingInterval>("SELECT * FROM TbHttpingInterval WHERE SiteId = @siteId AND StartTimestamp = @start AND IntervalLength = @length", new { siteId = _siteId, start = grp.Key.ToDbDateTime(), length }).SingleOrDefault();
                if (existing == null)
                {
                    Console.WriteLine($"MISSING: {_siteId}, {length}, {interval}");
                    conn.Insert(new TbHttpingInterval(_siteId, length, interval));
                }
                else if (new HttpingPointInterval(existing).ToString() != interval.ToString())
                {
                    if (existing.TotalCount <= interval.TotalCount)
                    {
                        Console.WriteLine($"DIFFERENT: {_siteId}, {length}, {interval.StartUtc}: existing {existing.TotalCount} vs recomputed {interval.TotalCount}");
                        conn.Update<TbHttpingInterval>(new TbHttpingInterval(_siteId, length, interval));
                    }
                }
            }
            var bad = conn.Query<long>("SELECT StartTimestamp FROM TbHttpingInterval WHERE SiteId = @siteId AND IntervalLength = @length ORDER BY StartTimestamp", new { siteId = _siteId, length })
                .Where(ts => ts != getStart(ts.FromDbDateTime()).ToDbDateTime());
            foreach (var start in bad)
            {
                Console.WriteLine($"INCORRECT: {_siteId}, {length}, {start.FromDbDateTime()}");
                conn.Query("DELETE FROM TbHttpingInterval WHERE SiteId = @siteId AND IntervalLength = @length AND StartTimestamp = @start", new { siteId = _siteId, length, start });
            }
        }

        private QueueViewable<HttpingPointInterval> loadRecentIntervals(SqliteConnection conn, HttpingIntervalLength length)
        {
            return new QueueViewable<HttpingPointInterval>(conn.Query<TbHttpingInterval>($@"
                    SELECT *
                    FROM {nameof(TbHttpingInterval)}
                    WHERE {nameof(TbHttpingInterval.SiteId)} = @siteId AND {nameof(TbHttpingInterval.IntervalLength)} = @length
                    ORDER BY {nameof(TbHttpingInterval.StartTimestamp)} DESC
                    LIMIT 500",
                    new { siteId = _siteId, length })
                .Select(r => new HttpingPointInterval(r)).Reverse());
        }

        private void thread()
        {
            var next = DateTime.UtcNow;
            while (!_ct.IsCancellationRequested)
            {
                try
                {
                    using var hc = new HttpClient(); // we create a new one each time to make sure it's not keepalive and it's forced to negotiate SSL
                    hc.Timeout = TimeSpan.FromSeconds(Settings.Interval.TotalSeconds * 0.90);

                    double msResponse = -1;
                    bool error = false;
                    bool ok = false;
                    var start = DateTime.UtcNow;
                    try
                    {
                        if (!_svc.IsGoodInternetConnection())
                            goto skip;
                        var response = hc.GetAsync(Settings.Url).GetAwaiter().GetResult();
                        var bytes = response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
                        msResponse = (DateTime.UtcNow - start).TotalMilliseconds;
                        if (response.StatusCode == System.Net.HttpStatusCode.OK && Encoding.UTF8.GetString(bytes).Contains(Settings.MustContain))
                            ok = true;
                        if (!_svc.IsGoodInternetConnection())
                            goto skip;
                    }
                    catch
                    {
                        error = true;
                    }

                    lock (Lock)
                    {
                        // Add this data point to Recent
                        var pt = new HttpingPoint { Timestamp = start.ToUnixSeconds() };
                        if (error)
                            pt.MsResponse = 65535; // timeout
                        else if (!ok)
                            pt.MsResponse = 0; // wrong code or didn't contain what we wanted
                        else
                            pt.MsResponse = (ushort)((int)Math.Round(msResponse)).Clip(1, 65534);
                        Recent.Enqueue(pt);
                        using (var conn = _svc._db.OpenConnection())
                            conn.Insert(new TbHttpingRecent { SiteId = _siteId, Timestamp = start.ToDbDateTime(), MsResponse = pt.MsResponse });
                        // Maintain the last 35 days in order to calculate monthly percentiles precisely
                        var cutoff = DateTime.UtcNow.AddDays(-35).ToUnixSeconds();
                        while (Recent.Count > 0 && Recent[0].Timestamp < cutoff)
                            Recent.Dequeue();

                        // Recalculate stats if we've crossed into the next minute
                        var prevPt = Recent.Count >= 2 ? Recent[^2].Timestamp.FromUnixSeconds() : (DateTime?)null;
                        if (prevPt != null && prevPt.Value.TruncatedToMinutes() != start.TruncatedToMinutes())
                        {
                            AddIntervalIfRequired(Twominutely, prevPt.Value, start, GetStartOfTwominute, HttpingIntervalLength.TwoMinutes);
                            AddIntervalIfRequired(Hourly, prevPt.Value, start, GetStartOfHour, HttpingIntervalLength.Hour);
                            AddIntervalIfRequired(Daily, prevPt.Value, start, GetStartOfLocalDayInUtc, HttpingIntervalLength.Day);
                            AddIntervalIfRequired(Monthly, prevPt.Value, start, GetStartOfLocalMonthInUtc, HttpingIntervalLength.Month);
                        }

                        // Maintain the last 500 entries of each of these; monthly records are maintained forever
                        while (Twominutely.Count > 500)
                            Twominutely.Dequeue();
                        while (Hourly.Count > 500)
                            Hourly.Dequeue();
                        while (Daily.Count > 500)
                            Daily.Dequeue();
                    }
                }
                catch
                {
                }

            skip:
                next += Settings.Interval;
                if (next < DateTime.UtcNow - Settings.Interval)
                    next = DateTime.UtcNow; // lagging behind too much; reset
                var sleepDuration = next.ToUniversalTime() - DateTime.UtcNow;
                if (sleepDuration > TimeSpan.Zero)
                    _ct.WaitHandle.WaitOne(sleepDuration);
            }
        }

        public Func<DateTime, DateTime> GetStartFunc(HttpingIntervalLength interval) =>
            interval == HttpingIntervalLength.TwoMinutes ? GetStartOfTwominute :
            interval == HttpingIntervalLength.Hour ? GetStartOfHour :
            interval == HttpingIntervalLength.Day ? GetStartOfLocalDayInUtc :
            interval == HttpingIntervalLength.Month ? GetStartOfLocalMonthInUtc : GetStartOfLocalYearInUtc;

        public DateTime GetStartOfTwominute(DateTime dt) => new DateTime(dt.Year, dt.Month, dt.Day, dt.Hour, (dt.Minute / 2) * 2, 0, DateTimeKind.Utc);
        public DateTime GetStartOfHour(DateTime dt) => new DateTime(dt.Year, dt.Month, dt.Day, dt.Hour, 0, 0, DateTimeKind.Utc);

        public DateTime GetStartOfLocalDayInUtc(DateTime utc)
        {
            var local = TimeZoneInfo.ConvertTimeFromUtc(utc, Timezone);
            local = new DateTime(local.Year, local.Month, local.Day, 0, 0, 0, DateTimeKind.Unspecified);
            return TimeZoneInfo.ConvertTimeToUtc(local, Timezone);
        }

        public DateTime GetStartOfLocalMonthInUtc(DateTime utc)
        {
            var local = TimeZoneInfo.ConvertTimeFromUtc(utc, Timezone);
            local = new DateTime(local.Year, local.Month, 1, 0, 0, 0, DateTimeKind.Unspecified);
            return TimeZoneInfo.ConvertTimeToUtc(local, Timezone);
        }

        public DateTime GetStartOfLocalYearInUtc(DateTime utc)
        {
            var local = TimeZoneInfo.ConvertTimeFromUtc(utc, Timezone);
            local = new DateTime(local.Year, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
            return TimeZoneInfo.ConvertTimeToUtc(local, Timezone);
        }

        private void AddIntervalIfRequired(QueueViewable<HttpingPointInterval> queue, DateTime dtPrevUtc, DateTime dtCurUtc, Func<DateTime, DateTime> getIntervalStart, HttpingIntervalLength length)
        {
            var startPrevUtc = getIntervalStart(dtPrevUtc);
            var startCurUtc = getIntervalStart(dtCurUtc);
            if (startPrevUtc != startCurUtc)
            {
                var stat = ComputeStat(startPrevUtc, startCurUtc);
                queue.Enqueue(stat);
                using (var conn = _svc._db.OpenConnection())
                    conn.Insert(new TbHttpingInterval(_siteId, length, stat));
            }
        }

        private HttpingPointInterval ComputeStat(DateTime startPrevUtc, DateTime startCurUtc)
        {
            var startPrevTs = startPrevUtc.ToUnixSeconds();
            var startCurTs = startCurUtc.ToUnixSeconds();
            var msResponse = new List<ushort>();
            var interval = new HttpingPointInterval { StartUtc = startPrevUtc };
            for (int i = Recent.Count - 2 /* because the last point is known to be in the new interval */; i >= 0; i--)
            {
                var pt = Recent[i];
                if (pt.Timestamp < startPrevTs)
                    break; // none of the other points will be within this interval
                if (pt.Timestamp >= startCurTs)
                    continue; // should never trigger but in case this method is called in other circumstances...
                if (interval.CountSample(pt.MsResponse))
                    msResponse.Add(pt.MsResponse);
            }
            Ut.Assert(interval.TotalCount == interval.TimeoutCount + interval.ErrorCount + msResponse.Count);
            if (msResponse.Count > 0)
            {
                msResponse.Sort();
                SetPercentiles(ref interval.MsResponse, msResponse);
            }
            return interval;
        }

        private static void SetPercentiles(ref HttpingStatistic stat, List<ushort> sortedValues)
        {
            stat.Prc01 = sortedValues[(sortedValues.Count - 1) * 1 / 100];
            stat.Prc25 = sortedValues[(sortedValues.Count - 1) * 25 / 100];
            stat.Prc50 = sortedValues[(sortedValues.Count - 1) * 50 / 100];
            stat.Prc75 = sortedValues[(sortedValues.Count - 1) * 75 / 100];
            stat.Prc95 = sortedValues[(sortedValues.Count - 1) * 95 / 100];
            stat.Prc99 = sortedValues[(sortedValues.Count - 1) * 99 / 100];
        }
    }

    struct HttpingPoint
    {
        public uint Timestamp; // seconds since 1970-01-01 00:00:00 UTC
        public ushort MsResponse; // 65535 = timeout; 0 = error (wrong status code or expected text missing)

        public HttpingPoint(TbHttpingRecent r) : this()
        {
            Timestamp = (uint)(r.Timestamp / 1000);
            MsResponse = (ushort)r.MsResponse;
        }

        public override string ToString() => $"{Timestamp.FromUnixSeconds()} : {MsResponse:#,0} ms";
    }

    struct HttpingStatistic
    {
        public ushort Prc01;
        public ushort Prc25;
        public ushort Prc50;
        public ushort Prc75;
        public ushort Prc95;
        public ushort Prc99;

        public override string ToString() => $"{Prc01} / {Prc50} / {Prc99}";
    }

    struct HttpingPointInterval
    {
        public DateTime StartUtc; // UTC timestamp of the beginning of this interval
        public HttpingStatistic MsResponse; // timeouts and errors are not included
        public int TotalCount;
        public int TimeoutCount;
        public int ErrorCount;

        public HttpingPointInterval(TbHttpingInterval r) : this()
        {
            StartUtc = r.StartTimestamp.FromDbDateTime();
            TotalCount = r.TotalCount;
            TimeoutCount = r.TimeoutCount;
            ErrorCount = r.ErrorCount;
            MsResponse.Prc01 = (ushort)r.MsResponsePrc01;
            MsResponse.Prc25 = (ushort)r.MsResponsePrc25;
            MsResponse.Prc50 = (ushort)r.MsResponsePrc50;
            MsResponse.Prc75 = (ushort)r.MsResponsePrc75;
            MsResponse.Prc95 = (ushort)r.MsResponsePrc95;
            MsResponse.Prc99 = (ushort)r.MsResponsePrc99;
        }

        public override string ToString() => $"{StartUtc} : {TotalCount:#,0} samples, {TimeoutCount + ErrorCount:#,0} timeouts/errors, {MsResponse}";

        public bool CountSample(ushort msResponse)
        {
            TotalCount++;
            if (msResponse == 65535)
                TimeoutCount++;
            else if (msResponse == 0)
                ErrorCount++;
            else
                return true;
            return false;
        }

        public HttpingIntervalDto ToDto()
        {
            return new HttpingIntervalDto
            {
                TotalCount = TotalCount,
                TimeoutCount = TimeoutCount,
                ErrorCount = ErrorCount,
                MsResponsePrc01 = MsResponse.Prc01,
                MsResponsePrc25 = MsResponse.Prc25,
                MsResponsePrc50 = MsResponse.Prc50,
                MsResponsePrc75 = MsResponse.Prc75,
                MsResponsePrc95 = MsResponse.Prc95,
                MsResponsePrc99 = MsResponse.Prc99,
            };
        }
    }

    enum HttpingIntervalLength
    {
        TwoMinutes = 1,
        Hour = 2,
        Day = 3,
        Month = 4, // calendar month, midnight 1st to next midnight 1st
        Year = 5, // calendar year
    }

    class TbHttpingSite
    {
        [Key]
        public long SiteId { get; set; }
        public string InternalName { get; set; }
    }

    class TbHttpingRecent
    {
        public long SiteId { get; set; }
        public long Timestamp { get; set; }
        public int MsResponse { get; set; }
    }

    class TbHttpingInterval
    {
        [ExplicitKey]
        public long SiteId { get; set; }
        [ExplicitKey]
        public long StartTimestamp { get; set; }
        [ExplicitKey]
        public HttpingIntervalLength IntervalLength { get; set; }

        public int TotalCount { get; set; }
        public int TimeoutCount { get; set; }
        public int ErrorCount { get; set; }

        public int MsResponsePrc01 { get; set; } // timeouts and errors are not included
        public int MsResponsePrc25 { get; set; }
        public int MsResponsePrc50 { get; set; }
        public int MsResponsePrc75 { get; set; }
        public int MsResponsePrc95 { get; set; }
        public int MsResponsePrc99 { get; set; }

        public TbHttpingInterval() // for Dapper
        {
        }

        public TbHttpingInterval(long siteId, HttpingIntervalLength length, HttpingPointInterval stat)
        {
            SiteId = siteId;
            StartTimestamp = stat.StartUtc.ToDbDateTime();
            IntervalLength = length;

            TotalCount = stat.TotalCount;
            TimeoutCount = stat.TimeoutCount;
            ErrorCount = stat.ErrorCount;

            MsResponsePrc01 = stat.MsResponse.Prc01;
            MsResponsePrc25 = stat.MsResponse.Prc25;
            MsResponsePrc50 = stat.MsResponse.Prc50;
            MsResponsePrc75 = stat.MsResponse.Prc75;
            MsResponsePrc95 = stat.MsResponse.Prc95;
            MsResponsePrc99 = stat.MsResponse.Prc99;
        }
    }
}
