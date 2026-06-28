using System.Collections.Concurrent;
using System.Diagnostics;
using RT.Serialization;
using RT.Util.ExtensionMethods;
using SkiaSharp;
using Webber.Client.Models;
using Webber.Server.Services;

namespace Webber.Server.Blocks;

class RainCloudBlockConfig
{
    public double LocationX { get; set; }
    public double LocationY { get; set; }
    public string CachePath { get; set; } = null;
    public string DumpImagesPath { get; set; } = null;
    public string OxiPngPath { get; set; } = null;
}

class RainCloudBlockServer : SimpleBlockServerBase<RainCloudBlockDto>
{
    private RainCloudBlockConfig _config;
    private MetOfficeMapsService _metoffice;
    private Dictionary<string, RainCloudPtDto> _havePoints = new();
    private BlockingCollection<string> _pngsToCompress = new();
    private ILogger _logger;

    private static int mapRain(SKColor c)
    {
        return (uint)c switch
        {
            0x00000000 => 0,
            0xff0000fe => 1,
            0xff3265fe => 2,
            0xff0cbcfe => 3,
            0xff00a300 => 4,
            0xfffecb00 => 5,
            0xfffe9800 => 6,
            0xfffe0000 => 7,
            0xffb30000 => 8,
            _ => -1,
        };
    }
    private static int mapCloud(SKColor c)
    {
        var alpha = ((uint)c) >> 24; // there are only 8 distinct values of alpha now, apart from occasional random noise dots that can have any alpha
        return alpha switch
        {
            0x00 => 0,
            0x20 => 1,
            0x40 => 2,
            0x60 => 3,
            0x80 => 5,
            0xA0 => 6,
            0xC0 => 7,
            0xE0 => 8,
            _ => -1,
        };
    }

    public RainCloudBlockServer(IServiceProvider sp, RainCloudBlockConfig config)
        : base(sp, TimeSpan.FromMinutes(5))
    {
        _config = config;
        _metoffice = new MetOfficeMapsService();
        _logger = sp.GetRequiredService<ILogger<RainCloudBlockServer>>();
        if (_config.DumpImagesPath != null)
        {
            new Thread(pngCompressThread) { IsBackground = true }.Start();
            var queue = Path.Combine(_config.DumpImagesPath, "queue.txt");
            if (File.Exists(queue))
                foreach (var png in File.ReadAllLines(queue))
                    _pngsToCompress.Add(png);
        }
    }

    public override void Start(CancellationToken cancellationToken = default)
    {
        if (_config.CachePath != null)
            if (File.Exists(_config.CachePath))
                _havePoints = ClassifyXml.DeserializeFile<Dictionary<string, RainCloudPtDto>>(_config.CachePath);
        base.Start(cancellationToken);
    }

    protected override bool ShouldTick() => true;

    protected override RainCloudBlockDto Tick()
    {
        _metoffice.Refresh();

        var rainPast = _metoffice.Models["rainfall_radar"].Timesteps.Where(ts => ts.Time >= DateTime.Now.AddHours(-24)).ToList();
        var rainFore = _metoffice.Models["total_precipitation_rate"].Timesteps.Where(ts => ts.Time <= DateTime.Now.AddHours(48)).ToList();
        var cloudFore = _metoffice.Models["cloud_amount_total"].Timesteps.Where(ts => ts.Time <= DateTime.Now.AddHours(48)).ToList();

        var newPoints = new Dictionary<string, RainCloudPtDto>();

        var dto = new RainCloudBlockDto { ValidUntilUtc = DateTime.UtcNow + TimeSpan.FromMinutes(30) };
        var maxPast = rainPast.Max(r => r.Time);
        dto.Rain = rainPast.Select(p => GetPt(p, newPoints, mapRain, false)).Concat(rainFore.Where(r => r.Time > maxPast).Select(p => GetPt(p, newPoints, mapRain, true))).ToArray();
        dto.Cloud = cloudFore.Select(p => GetPt(p, newPoints, mapCloud, true)).ToArray();

        _havePoints = newPoints;
        if (_config.CachePath != null)
            ClassifyXml.SerializeToFile(_havePoints, _config.CachePath);

        return dto;
    }

    private RainCloudPtDto GetPt(MetOfficeMapsService.Timestep ts, Dictionary<string, RainCloudPtDto> newPoints, Func<SKColor, int> map, bool isForecast)
    {
        if (_havePoints.ContainsKey(ts.Url))
            return newPoints[ts.Url] = _havePoints[ts.Url];

        var result = new RainCloudPtDto { AtUtc = ts.Time, Counts = null, IsForecast = isForecast };
        // download and decode bitmap
        SKBitmap bmp;
        try
        {
            var bytes = _metoffice.DownloadImage(ts).GetAwaiter().GetResult();
            bmp = SKBitmap.Decode(bytes);
            if (_config.DumpImagesPath != null)
                if (ts.ModelName == "rainfall_radar" || ts.ModelName == "total_precipitation_rate")
                {
                    var pngname = Path.Combine(_config.DumpImagesPath, $@"{ts.Time:yyyy-MM-dd'T'HH'.'mm}--{(isForecast ? $"fc--{(ts.Time - ts.ModelRun).TotalMinutes:0000}" : "ob")}.png");
                    _logger.LogInformation($"Downloaded {pngname} from {ts.Url} because it wasn't in cache");
                    File.WriteAllBytes(pngname, bytes);
                    _pngsToCompress.Add(pngname);
                }
        }
        catch (Exception e)
        {
            _logger.LogWarning(e, $"Download failed for {ts.ModelName} ({ts.Url})");
            // don't save to newPoints - will cause download to retry on next tick
            return result;
        }

        result.Counts = GetCounts(bmp, _config.LocationX, _config.LocationY, map);
        if (result.Counts.Sum() < 6)
        {
            _logger.LogWarning($"GetCounts: only {result.Counts.Sum()} valid pixels for {ts.ModelName} ({ts.Url})");
            result.Counts = null;
        }

        newPoints[ts.Url] = result; // don't retry this download again
        return result;
    }

    private static int[] GetCounts(SKBitmap bmp, double locX, double locY, Func<SKColor, int> map)
    {
        int x = (int)Math.Round(bmp.Width * locX);
        int y = (int)Math.Round(bmp.Height * locY);
        var counts = new int[9];
        for (int cy = y - 1; cy <= y + 1; cy++)
            for (int cx = x - 1; cx <= x + 1; cx++)
            {
                var val = map(bmp.GetPixel(cx, cy));
                if (val >= 0)
                    counts[val]++;
            }
        return counts;
    }

    private void pngCompressThread()
    {
        foreach (var pngname in _pngsToCompress.GetConsumingEnumerable())
        {
            if (_config.OxiPngPath == null)
                continue;
            var psi = new ProcessStartInfo(_config.OxiPngPath, ["-o", "max", "--strip", "safe", "--alpha", "--preserve", "--threads", "1", pngname]);
            var oxi = new Process { StartInfo = psi };
            oxi.Start();
            oxi.PriorityClass = ProcessPriorityClass.Idle;
            oxi.WaitForExit();
            File.WriteAllLines(Path.Combine(_config.DumpImagesPath, "queue.txt"), _pngsToCompress);
            Thread.Sleep(1000);
        }
    }
}
