using System.Net;
using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using Lextm.SharpSnmpLib.Security;
using Webber.Client.Models;
using Webber.Server.Services;

namespace Webber.Server.Blocks;

class ComputerStatsBlockConfig
{
    public List<ComputerConfig> Computers { get; set; } = new();
    public int IntervalMs { get; set; } = 5000; // Default: poll every 5 seconds
}

class ComputerConfig
{
    public string Name { get; set; }

    // Base URL for monitoring endpoints (e.g., "http://192.168.1.6:3001")
    // Will append /load/cpu, /load/gpu, /load/ram, /info as needed
    public string MonitoringUrl { get; set; }

    // API backend: "dashdot" (default), "glances", or "prometheus"
    public string ApiMode { get; set; } = "dashdot";

    // Prometheus node-exporter URL (e.g., "http://192.168.1.5:9100")
    public string NodeExporterUrl { get; set; }

    // Prometheus dcgm-exporter URL (e.g., "http://192.168.1.5:9400"), optional
    public string DcgmExporterUrl { get; set; }

    // Optional SNMP settings for power consumption from UPS
    public string SnmpHost { get; set; }
    public string SnmpUser { get; set; }
    public string SnmpPassword { get; set; }
    public string SnmpOid { get; set; } = "1.3.6.1.4.1.534.1.4.4.1.4.1"; // Default OID for Eaton UPS output watts
}

class ComputerInfo
{
    public int ConsecutiveFailures { get; set; }
    public bool IsOffline { get; set; }
    public int TicksSinceLastCheck { get; set; }
}

class ComputerStatsBlockServer : SimpleBlockServerBase<ComputerStatsBlockDto>
{
    private ComputerStatsBlockConfig _config;
    private Dictionary<string, SnmpConnection> _snmpConnections = new();
    private Dictionary<string, ComputerInfo> _computerInfo = new();
    private Dictionary<string, ComputerStats> _lastSuccessfulResults = new();
    private Dictionary<string, IComputerStatsProvider> _providers = new();

    public override Type ConfigType => typeof(ComputerStatsBlockConfig);
    public override void UpdateConfig(object newConfig)
    {
        _config = (ComputerStatsBlockConfig)newConfig;
        _interval = TimeSpan.FromMilliseconds(_config.IntervalMs);
        SetupFromConfig();
    }

    public ComputerStatsBlockServer(IServiceProvider sp, ComputerStatsBlockConfig config)
        : base(sp, config.IntervalMs)
    {
        _config = config;
        SetupFromConfig();
    }

    private void SetupFromConfig()
    {
        _snmpConnections.Clear();
        _computerInfo.Clear();
        _lastSuccessfulResults.Clear();
        _providers.Clear();

        foreach (var computer in _config.Computers)
        {
            _computerInfo[computer.Name] = new ComputerInfo();

            if (!string.IsNullOrWhiteSpace(computer.SnmpHost))
            {
                try
                {
                    _snmpConnections[computer.Name] = InitializeSnmpConnection(computer);
                }
                catch (Exception ex)
                {
                    Logger.LogWarning($"Failed to initialize SNMP for '{computer.Name}': {ex.Message}");
                }
            }

            _providers[computer.Name] = computer.ApiMode switch
            {
                "glances" => new GlancesStatsProvider(),
                "prometheus" => new PrometheusStatsProvider(),
                _ => new DashdotStatsProvider()
            };
        }
    }

    private class SnmpConnection
    {
        public IPEndPoint Endpoint { get; set; }
        public OctetString UserName { get; set; }
        public IPrivacyProvider Privacy { get; set; }
        public ObjectIdentifier Oid { get; set; }
    }

    private SnmpConnection InitializeSnmpConnection(ComputerConfig config)
    {
        // Parse host and port
        var hostParts = config.SnmpHost.Split(':');
        var host = hostParts[0];
        var port = hostParts.Length > 1 ? int.Parse(hostParts[1]) : 161;

        var endpoint = new IPEndPoint(IPAddress.Parse(host), port);
        var userName = new OctetString(config.SnmpUser);

        // Create authentication provider (SHA-1, No Privacy)
        // Note: SHA-1 is required for compatibility with Eaton UPS
#pragma warning disable CS0618
        var auth = new SHA1AuthenticationProvider(new OctetString(config.SnmpPassword));
#pragma warning restore CS0618
        var privacy = new DefaultPrivacyProvider(auth);

        return new SnmpConnection
        {
            Endpoint = endpoint,
            UserName = userName,
            Privacy = privacy,
            Oid = new ObjectIdentifier(config.SnmpOid)
        };
    }

    private async Task<double?> FetchPowerConsumptionAsync(string computerName)
    {
        if (!_snmpConnections.TryGetValue(computerName, out var snmpConn))
        {
            return null;
        }

        return await Task.Run(() => GetPowerConsumptionSnmp(snmpConn));
    }

    private ComputerStats CreateOfflineStats(string name)
    {
        return new ComputerStats
        {
            Name = name,
            IsOffline = true,
            CpuCores = new List<CpuCoreInfo>(),
            Gpu = new GpuInfo()
        };
    }

    private Task<ComputerStats> HandleOfflineComputerAsync(ComputerConfig config)
    {
        var info = _computerInfo[config.Name];
        info.TicksSinceLastCheck++;

        // Only attempt reconnect every 10 ticks when offline
        if (info.TicksSinceLastCheck < 10)
        {
            return Task.FromResult(CreateOfflineStats(config.Name));
        }

        info.TicksSinceLastCheck = 0;

        // Try to bring computer back online by fetching stats directly
        return _providers[config.Name].FetchStatsAsync(config).ContinueWith(task =>
        {
            if (task.IsCompletedSuccessfully)
            {
                info.IsOffline = false;
                info.ConsecutiveFailures = 0;
                Logger.LogInformation($"Computer '{config.Name}' is back online");
                return task.Result;
            }

            Logger.LogDebug($"Computer '{config.Name}' still offline");
            return CreateOfflineStats(config.Name);
        });
    }

    private void ProcessComputerResult(ComputerConfig config, Task<ComputerStats> task, Task<double?> powerTask, List<ComputerStats> computers)
    {
        var info = _computerInfo[config.Name];

        if (task.IsCompletedSuccessfully)
        {
            var stats = task.Result;

            // If this is offline stats (returned from HandleOfflineComputerAsync), add power and return
            if (stats.IsOffline)
            {
                // Add power consumption if available (UPS can report power even when computer is offline)
                if (powerTask.IsCompletedSuccessfully)
                {
                    stats.PowerConsumptionWatts = powerTask.Result;
                }

                computers.Add(stats);
                return;
            }

            // This is real data from a successful fetch
            info.ConsecutiveFailures = 0;
            stats.IsOffline = false;

            // Add power consumption if available
            if (powerTask.IsCompletedSuccessfully)
            {
                stats.PowerConsumptionWatts = powerTask.Result;
            }
            else if (_snmpConnections.ContainsKey(config.Name))
            {
                Logger.LogWarning($"Failed to fetch power consumption for '{config.Name}': {powerTask.Exception?.InnerException?.Message ?? powerTask.Exception?.Message}");
            }

            // Cache successful result
            _lastSuccessfulResults[config.Name] = stats;
            computers.Add(stats);
            return;
        }

        // Failed
        info.ConsecutiveFailures++;
        Logger.LogWarning($"Failed to fetch stats for computer '{config.Name}' (failure {info.ConsecutiveFailures}/5): {task.Exception?.InnerException?.Message ?? task.Exception?.Message}");

        if (info.ConsecutiveFailures >= 5 && !info.IsOffline)
        {
            info.IsOffline = true;
            info.TicksSinceLastCheck = 0;
            Logger.LogWarning($"Computer '{config.Name}' marked as OFFLINE after 5 consecutive failures");
            // Clear cache when going offline
            _lastSuccessfulResults.Remove(config.Name);
        }

        // Return cached result if available and not offline, otherwise return offline stats
        if (!info.IsOffline && _lastSuccessfulResults.TryGetValue(config.Name, out var cachedStats))
        {
            Logger.LogInformation($"Using cached stats for '{config.Name}' due to temporary failure");
            computers.Add(cachedStats);
        }
        else
        {
            computers.Add(CreateOfflineStats(config.Name));
        }
    }

    protected override ComputerStatsBlockDto Tick()
    {
        var computerTasks = new List<Task<ComputerStats>>();
        var powerTasks = new List<Task<double?>>();
        var computerConfigs = new List<ComputerConfig>();

        // Prepare tasks for all computers
        foreach (var computerConfig in _config.Computers)
        {
            var info = _computerInfo[computerConfig.Name];

            // Create computer stats task
            if (info.IsOffline)
            {
                computerTasks.Add(HandleOfflineComputerAsync(computerConfig));
            }
            else
            {
                computerTasks.Add(_providers[computerConfig.Name].FetchStatsAsync(computerConfig));
            }

            // Create power consumption task
            powerTasks.Add(_snmpConnections.ContainsKey(computerConfig.Name)
                ? FetchPowerConsumptionAsync(computerConfig.Name)
                : Task.FromResult<double?>(null));

            computerConfigs.Add(computerConfig);
        }

        // Wait for all tasks to complete (ignore exceptions, we handle them per-task below)
        try
        {
            Task.WaitAll(computerTasks.Cast<Task>().Concat(powerTasks).ToArray());
        }
        catch (AggregateException)
        {
            // Some tasks failed, we'll handle them individually below
        }

        // Process results
        var computers = new List<ComputerStats>();
        for (int i = 0; i < computerTasks.Count; i++)
        {
            ProcessComputerResult(computerConfigs[i], computerTasks[i], powerTasks[i], computers);
        }

        return new ComputerStatsBlockDto
        {
            Computers = computers,
            ValidUntilUtc = DateTime.UtcNow.AddSeconds(_config.IntervalMs / 1000 * 2)
        };
    }

    private double? GetPowerConsumptionSnmp(SnmpConnection conn)
    {
        try
        {
            // Redo discovery each time to get fresh engine boots/time
            var discovery = Messenger.GetNextDiscovery(SnmpType.GetRequestPdu);
            var report = discovery.GetResponse(1000, conn.Endpoint);

            var variables = new List<Variable> { new Variable(conn.Oid) };

#pragma warning disable CS0618
            var request = new GetRequestMessage(
                VersionCode.V3,
                Messenger.NextMessageId,
                Messenger.NextRequestId,
                conn.UserName,
                variables,
                conn.Privacy,
                Messenger.MaxMessageSize,
                report
            );
#pragma warning restore CS0618

            var reply = request.GetResponse(1000, conn.Endpoint);

            if (reply.Pdu().Variables.Count > 0)
            {
                var data = reply.Pdu().Variables[0].Data;

                // Parse the result as a number (watts)
                if (int.TryParse(data.ToString(), out var watts))
                {
                    return watts;
                }
                if (double.TryParse(data.ToString(), out var wattsDouble))
                {
                    return wattsDouble;
                }

                Logger.LogWarning($"Failed to parse SNMP data: '{data}'");
            }

            return null;
        }
        catch (Exception ex)
        {
            Logger.LogWarning($"Failed to query SNMP for power consumption: {ex.Message}");
            return null;
        }
    }
}
