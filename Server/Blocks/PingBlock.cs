using System.Net.NetworkInformation;
using Dapper;
using Dapper.Contrib.Extensions;
using RT.Util.ExtensionMethods;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

class PingBlockConfig
{
    public string Host { get; set; } = "8.8.8.8";
    public int IntervalMs { get; set; } = 5000;
    public int MaxWaitMs { get; set; } = 2000;
    public int RecentLength { get; set; } = 24;
}

class PingBlockServer : SimpleBlockServerBase<PingBlockDto>
{
    private PingBlockConfig _config;
    private IDbService _db;
    private Queue<(int? ms, DateTime utc)> _recentPings = new();

    public PingBlockServer(IServiceProvider sp, PingBlockConfig config, IDbService db)
        : base(sp, config.IntervalMs)
    {
        _config = config;
        _db = db;
        registerMigrations();
    }

    public IEnumerable<(DateTime SentUtc, int? PingMs)> RecentPings => _recentPings.Select(pt => (pt.utc, pt.ms));

    public override void Start(CancellationToken cancellationToken = default)
    {
        if (_db.Enabled)
            using (var conn = _db.OpenConnection())
                _recentPings = conn.Query<TbPingHistoryEntry>(
                        $@"SELECT * FROM {nameof(TbPingHistoryEntry)} WHERE {nameof(TbPingHistoryEntry.Timestamp)} >= @limit ORDER BY {nameof(TbPingHistoryEntry.Timestamp)}",
                        new { limit = DateTime.UtcNow.AddMilliseconds(-_config.IntervalMs * (_config.RecentLength + 0.5)).ToDbDateTime() }
                    )
                    .Select(pt => (ms: pt.Ping, utc: pt.Timestamp.FromDbDateTime()))
                    .ToQueue();

        base.Start(cancellationToken);
    }

    protected override bool ShouldTick() => true;

    protected override PingBlockDto Tick()
    {
        var ping = new Ping();
        var sentUtc = DateTime.UtcNow;
        var response = ping.Send(_config.Host, _config.MaxWaitMs);

        var dto = new PingBlockDto { ValidUntilUtc = sentUtc + TimeSpan.FromSeconds(15) };
        if (response.Status == IPStatus.Success)
            dto.Last = (int)Math.Min(response.RoundtripTime, _config.MaxWaitMs);
        else
            dto.Last = null;

        if (_db.Enabled)
            using (var conn = _db.OpenConnection())
                conn.Insert(new TbPingHistoryEntry { Timestamp = sentUtc.ToDbDateTime(), Ping = dto.Last });

        dto.Recent = _recentPings.EnqueueWithMaxCapacity((dto.Last, sentUtc), _config.RecentLength).Select(c => c.Item1).ToArray();

        //var recent = new List<int?>();
        //for (var ts = sentUtc.AddMilliseconds(-_config.IntervalMs * (_config.RecentLength - 0.5)); ts < sentUtc; ts = ts.AddMilliseconds(_config.IntervalMs))
        //    recent.Add(_recentPings.Where(r => r.utc >= ts && r.utc < ts.AddMilliseconds(_config.IntervalMs)).Select(r => (int?)(r.ms ?? -1)).FirstOrDefault());
        //dto.Recent = recent.ToArray();

        return dto;
    }

    private void registerMigrations()
    {
        if (!_db.Enabled)
            return;
        _db.RegisterMigration("PingService", 0, 1, (conn, trn) =>
        {
            conn.Execute($@"CREATE TABLE {nameof(TbPingHistoryEntry)} (
                    {nameof(TbPingHistoryEntry.Timestamp)} INTEGER PRIMARY KEY,
                    {nameof(TbPingHistoryEntry.Ping)} INT NULL
                )", transaction: trn);
        });
    }

    class TbPingHistoryEntry
    {
        [ExplicitKey]
        public long Timestamp { get; set; }
        public int? Ping { get; set; }
    }
}
