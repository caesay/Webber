using RT.Util.ExtensionMethods;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

class SynologyRouterBlockConfig
{
    public int Port { get; set; } = 8000;
    public bool Https { get; set; } = false;
    public string LoginUser { get; set; }
    public string LoginPassword { get; set; }
    public int TxEstimated { get; set; } // in bytes
    public int RxEstimated { get; set; } // in bytes
    public string BaseUrl { get; set; } = "192.168.1.1";
    public int QueryIntervalMs { get; set; } = 2000; // this is the refresh rate of synology router traffic stats
    public double AverageDecay { get; set; } = 0.85;
    public double AverageDecayFast { get; set; } = 0.50;
    public int RecentHistory { get; set; } = 30;
    public string NasBaseUrl { get; set; } = "192.168.1.3";
    public int NasPort { get; set; } = 5000;
    public bool NasHttps { get; set; } = false;
    public string NasLoginUser { get; set; }
    public string NasLoginPassword { get; set; }
}

public record TxRxPair
{
    public DateTime Timestamp { get; set; }
    public int TxRate { get; set; }
    public int RxRate { get; set; }
}

public record TxRxDevicePairGroup
{
    public DateTime Timestamp { get; set; }
    public TxRxDevicePair[] Pairs { get; set; }
}

public record TxRxDevicePair : TxRxPair
{
    public string DeviceId { get; set; }
    public string DeviceIpv4 { get; set; }
    public string DeviceHostname { get; set; }
    public bool IsWireless { get; set; }
}

public record ActiveTorrentDetail
{
    public string Name { get; set; }
    public long Size { get; set; }
    public long TotalRx { get; set; }
    public long TotalTx { get; set; }
    public int Rx { get; set; }
    public int Tx { get; set; }
}

public record SynologyRouterBlockDto : BaseDto
{
    public int Rx { get; set; }
    public int RxMax { get; set; }
    public int[] RxHistory { get; set; }
    public int Tx { get; set; }
    public int TxMax { get; set; }
    public int[] TxHistory { get; set; }
    public TxRxDevicePairGroup TopDevices { get; set; }
    public ActiveTorrentDetail[] ActiveTorrents { get; set; }
    public bool Wan1 { get; set; }
    public bool Wan2 { get; set; }
    public int WifiClientCount { get; set; }
    public int LanClientCount { get; set; }
}

class SynologyRouterBlockServer : SimpleBlockServerBase<SynologyRouterBlockDto>
{
    private SynologSrmService _srm;
    private SynologDsmService _dsm;
    private SynologyRouterBlockConfig _config;

    Queue<TxRxDevicePairGroup> _devices = new Queue<TxRxDevicePairGroup>();

    public SynologyRouterBlockServer(IServiceProvider sp, SynologyRouterBlockConfig config)
        : base(sp, config.QueryIntervalMs)
    {
        _config = config;
        _srm = new SynologSrmService(config.BaseUrl, config.Port, config.Https, config.LoginUser, config.LoginPassword);

        if (config.NasLoginPassword != null && config.NasLoginUser != null)
            _dsm = new SynologDsmService(config.NasBaseUrl, config.NasPort, config.NasHttps, config.NasLoginUser, config.NasLoginPassword);
    }

    public override void Start(CancellationToken cancellationToken = default)
    {
        new Thread(TickSlow) { IsBackground = true }.Start();
        base.Start(cancellationToken);
    }

    void TickSlow()
    {
        // this runs in a separate loop as these requests can take longer,
        // and are not critical to update in real time
        var gatewaysTask = _srm.GetSmartWanGateway();
        var devicesTask = _srm.GetNetworkNsmDevice();
        Task.WaitAll(gatewaysTask, devicesTask);
        gateways = gatewaysTask.Result;
        devices = devicesTask.Result;
        Thread.Sleep(5000);
    }

    SynologyDeviceTraffic[] _lastTraffic;
    SynologySmartWanGatewayList gateways;
    SynologyNetworkDevices devices;

    protected override SynologyRouterBlockDto Tick()
    {
        if (devices == null || gateways == null)
            return null;

        var barSize = TimeSpan.FromSeconds(10);
        var historySize = _config.RecentHistory;
        var keepNum = historySize * ((int)barSize.TotalMilliseconds / _config.QueryIntervalMs);

        Task<SynologyDSTaskList> dsDownloadTask = null;
        Task<SynologyDSTaskList> dsUploadTask = null;
        Task<SynologyDeviceTraffic[]> srmTrafficTask = _srm.GetNgfwTraffic();

        if (_dsm != null)
        {
            dsDownloadTask = _dsm.GetDownloadStationTasks(limit: 3, sortby: "current_rate");
            dsUploadTask = _dsm.GetDownloadStationTasks(limit: 3, sortby: "upload_rate");
            Task.WaitAll(srmTrafficTask, dsDownloadTask, dsUploadTask);
        }
        else
        {
            Task.WaitAll(srmTrafficTask);
        }

        var traffic = srmTrafficTask.Result;
        if (_lastTraffic != null && _lastTraffic.SequenceEqual(traffic))
            return null;

        _lastTraffic = traffic;

        SynologySmartWanGateway wan1 = gateways.List.Where(g => g.InterfaceName == "ppp0").FirstOrDefault();
        SynologySmartWanGateway wan2 = gateways.List.Where(g => g.InterfaceName == "ppp1").FirstOrDefault();
        bool wan1Enabled = wan1?.NetStatus?.EqualsIgnoreCase("enabled") ?? false;
        bool wan2Enabled = wan2?.NetStatus?.EqualsIgnoreCase("enabled") ?? false;
        var lanDevices = devices.Devices.Where(d => !d.IsWireless).Count();
        var wifiDevices = devices.Devices.Where(d => d.IsWireless).Count();

        var time = DateTime.UtcNow;

        var pairs = from dev in devices.Devices
                    let tr = traffic.FirstOrDefault(traffic => traffic.DeviceID.EqualsIgnoreCase(dev.Mac))
                    where tr != null
                    select new TxRxDevicePair
                    {
                        DeviceHostname = dev.Hostname,
                        DeviceId = dev.Mac,
                        DeviceIpv4 = dev.IpAddr,
                        RxRate = tr.Download,
                        TxRate = tr.Upload,
                        Timestamp = time,
                        IsWireless = dev.IsWireless,
                    };

        var pairsArr = pairs.ToArray();
        var devicesCache = _devices.EnqueueWithMaxCapacity(new TxRxDevicePairGroup { Pairs = pairsArr, Timestamp = time }, keepNum);
        var barSizeGrouping = from pairGroup in devicesCache
                              group pairGroup by (int)(pairGroup.Timestamp.ToUnixSeconds() / (int)barSize.TotalSeconds) into g
                              orderby g.Key descending
                              select g;

        var totalByBarSize = from g in barSizeGrouping
                             let dev = g.SelectMany(z => z.Pairs)
                             select new TxRxPair { TxRate = dev.Max(t => t.TxRate), RxRate = dev.Max(t => t.RxRate) };

        var totalByBarSizeArr = totalByBarSize.Take(historySize).ToArray();
        Array.Reverse(totalByBarSizeArr);
        Array.Resize(ref totalByBarSizeArr, historySize);

        var topDevices = from g in barSizeGrouping
                         let dev = g.SelectMany(z => z.Pairs)
                         let d = (
                             from d in dev
                             group d by d.DeviceId into g2
                             let id = g2.Key
                             let firstPair = g2.OrderByDescending(z => z.Timestamp).First()
                             let combined = firstPair with { RxRate = g2.Max(t => t.RxRate), TxRate = g2.Max(t => t.TxRate) }
                             let txPerc = combined.TxRate / _config.TxEstimated
                             let rxPerc = combined.RxRate / _config.RxEstimated
                             let utilMax = Math.Min(1, Math.Max(txPerc, rxPerc))
                             orderby utilMax descending
                             select combined
                         )
                         select new TxRxDevicePairGroup { Pairs = d.Take(4).ToArray(), Timestamp = d.First().Timestamp };

        //var deviceOrder = topDevices
        //    .Take(60 / (int)barSize.TotalSeconds)
        //    .SelectMany(z => z.Pairs)
        //    .GroupBy(z => z.DeviceId)
        //    .OrderByDescending(g => Math.Max(g.Sum(t => t.TxRate), g.Sum(t => t.RxRate)))
        //    .Select(g => g.Key)
        //    .Take(3);

        var activeTorrents = new ActiveTorrentDetail[0];

        if (_dsm != null)
        {
            var torrentTaskList = from task in dsDownloadTask.Result.Tasks.Concat(dsUploadTask.Result.Tasks)
                                  let trans = task.Additional.Transfer
                                  where trans.SpeedDownload > 0 || trans.SpeedUpload > 0 || (trans.SizeDownloaded < task.Size)
                                  orderby Math.Max(trans.SpeedDownload, trans.SpeedUpload) descending, (trans.SizeDownloaded / task.Size) ascending
                                  select new ActiveTorrentDetail
                                  {
                                      Name = task.Title,
                                      Rx = trans.SpeedDownload,
                                      Tx = trans.SpeedUpload,
                                      Size = task.Size,
                                      TotalRx = trans.SizeDownloaded,
                                      TotalTx = trans.SizeUploaded,
                                  };

            activeTorrents = torrentTaskList.Take(4).ToArray();
        }

        // this just tries to ensure we always have exactly 4 traffic metrics, across both
        // device traffic and torrents.
        var deviceGroup = topDevices.First();
        var trafficCount = deviceGroup.Pairs.Length;
        var torrentCount = activeTorrents.Length;
        if (trafficCount >= 2 && torrentCount >= 2)
        {
            deviceGroup.Pairs = deviceGroup.Pairs.Take(2).ToArray();
            activeTorrents = activeTorrents.Take(2).ToArray();
        }
        else
        {
            if (trafficCount > torrentCount)
            {
                deviceGroup.Pairs = deviceGroup.Pairs.Take(4 - torrentCount).ToArray();
            }
            else
            {
                activeTorrents = activeTorrents.Take(4 - trafficCount).ToArray();
            }
        }

        var totalrx = traffic.Sum(k => k.Download);
        var totaltx = traffic.Sum(k => k.Upload);

        var dto = new SynologyRouterBlockDto()
        {
            Tx = totaltx,
            TxMax = _config.TxEstimated,
            TxHistory = totalByBarSizeArr.Select(t => t?.TxRate ?? 0).ToArray(),
            Rx = totalrx,
            RxMax = _config.RxEstimated,
            RxHistory = totalByBarSizeArr.Select(t => t?.RxRate ?? 0).ToArray(),
            TopDevices = deviceGroup,
            Wan1 = wan1Enabled,
            Wan2 = wan2Enabled,
            LanClientCount = lanDevices,
            WifiClientCount = wifiDevices,
            ActiveTorrents = activeTorrents,
        };

        return dto;
    }
}
