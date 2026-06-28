using System.Diagnostics;
using System.Management;
using System.Runtime.Versioning;
using RT.Util.ExtensionMethods;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

[SupportedOSPlatform("windows")]
internal class HwInfoBlockServer : SimpleBlockServerBase<HwInfoBlockDto>
{
    static readonly int METRIC_REFRESH_INTERVAL = 1000;

    PerformanceCounter _cpuCounter;
    List<PerformanceCounter> _cpuCoreCounters;
    List<PerformanceCounter> _gpuCounters;
    ManagementObjectSearcher _wmiObject;
    int _gpuFailed = 0;

    public HwInfoBlockServer(IServiceProvider sp) : base(sp, METRIC_REFRESH_INTERVAL)
    {
    }

    public override void Start(CancellationToken cancellationToken = default)
    {
        _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");

        var processorCategory = new PerformanceCounterCategory("Processor");
        var cores = processorCategory.GetInstanceNames().Where(n => !n.StartsWith("_"));
        _cpuCoreCounters = cores
            .Where(i => int.TryParse(i, out var _))
            .Select(int.Parse)
            .OrderBy(i => i)
            .Select(i => new PerformanceCounter("Processor", "% Processor Time", i.ToString())).ToList();

        _gpuCounters = GetGPUCounters();
        _wmiObject = new ManagementObjectSearcher("select * from Win32_OperatingSystem");

        base.Start(cancellationToken);
    }

    protected override HwInfoBlockDto Tick()
    {
        var coreLoads = _cpuCoreCounters.Select(c => c.NextValue()).ToArray();
        var maxIdx = coreLoads.MaxIndex(v => v);
        var maxLoad = coreLoads[maxIdx] / 100;
        var maxName = $"Core {_cpuCoreCounters[maxIdx].InstanceName}";

        float gpu = 999;
        if (_gpuFailed < 10)
        {
            try
            {
                gpu = GetGPUUsage(_gpuCounters) / 100;
                _gpuFailed = 0;
            }
            catch
            {
                _gpuCounters = GetGPUCounters();
                _gpuFailed++;
            }
        }

        return new HwInfoBlockDto
        {
            CpuTotalLoad = _cpuCounter.NextValue() / 100,
            CpuMaxCoreLoad = maxLoad,
            CpuMaxCoreName = maxName,
            GpuLoad = gpu,
            MemoryUtilization = GetRAMUsage(),
        };
    }

    private double GetRAMUsage()
    {
        var memoryValues = _wmiObject.Get().Cast<ManagementObject>().Select(mo => new
        {
            FreePhysicalMemory = double.Parse(mo["FreePhysicalMemory"].ToString()),
            TotalVisibleMemorySize = double.Parse(mo["TotalVisibleMemorySize"].ToString())
        }).FirstOrDefault();

        if (memoryValues != null)
        {
            var perc = ((memoryValues.TotalVisibleMemorySize - memoryValues.FreePhysicalMemory) / memoryValues.TotalVisibleMemorySize);
            return perc;
        }

        return 0;
    }

    private static float GetGPUUsage(List<PerformanceCounter> gpuCounters)
    {
        return gpuCounters.Sum(x => x.NextValue());
    }

    private static List<PerformanceCounter> GetGPUCounters()
    {
        var category = new PerformanceCounterCategory("GPU Engine");
        var counterNames = category.GetInstanceNames();

        var gpuCounters = counterNames
                            .Where(counterName => counterName.EndsWith("engtype_3D"))
                            .SelectMany(counterName => category.GetCounters(counterName))
                            .Where(counter => counter.CounterName.Equals("Utilization Percentage"))
                            .ToList();

        return gpuCounters;
    }
}
