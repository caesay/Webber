using System.Text.Json;
using Webber.Server.Blocks;

namespace Webber.Server.Services;

class ConfigWatcher
{
    private static readonly JsonDocumentOptions _jsonOptions = new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true };

    private readonly string _configPath;
    private readonly IEnumerable<IBlockServer> _blocks;
    private readonly ILogger<ConfigWatcher> _logger;
    private readonly Dictionary<string, string> _lastConfigJson = new();
    private readonly SemaphoreSlim _checkLock = new(1, 1);

    public ConfigWatcher(string configPath, IEnumerable<IBlockServer> blocks, ILogger<ConfigWatcher> logger)
    {
        _configPath = configPath;
        _blocks = blocks;
        _logger = logger;
    }

    public void Start(CancellationToken appStopping)
    {
        SnapshotCurrentConfig();
        Task.Run(async () =>
        {
            while (!appStopping.IsCancellationRequested)
            {
                try { await Task.Delay(TimeSpan.FromSeconds(5), appStopping); }
                catch (OperationCanceledException) { break; }

                await CheckForChanges(appStopping);
            }
        });
    }

    private void SnapshotCurrentConfig()
    {
        try
        {
            var json = File.ReadAllText(_configPath);
            using var doc = JsonDocument.Parse(json, _jsonOptions);
            foreach (var block in _blocks)
            {
                if (block.ConfigType == null) continue;
                if (doc.RootElement.TryGetProperty(block.ConfigSectionName, out var section))
                    _lastConfigJson[block.ConfigSectionName] = section.GetRawText();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to snapshot initial config");
        }
    }

    private async Task CheckForChanges(CancellationToken appStopping)
    {
        if (!await _checkLock.WaitAsync(0)) return;
        try
        {
            var json = await File.ReadAllTextAsync(_configPath, appStopping);
            using var doc = JsonDocument.Parse(json, _jsonOptions);

            foreach (var block in _blocks)
            {
                if (block.ConfigType == null) continue;
                if (!doc.RootElement.TryGetProperty(block.ConfigSectionName, out var section))
                    continue;

                var newJson = section.GetRawText();
                if (_lastConfigJson.TryGetValue(block.ConfigSectionName, out var oldJson) && oldJson == newJson)
                    continue;

                _logger.LogInformation("Config changed for {Block}, restarting...", block.ConfigSectionName);
                _lastConfigJson[block.ConfigSectionName] = newJson;

                object newConfig;
                try
                {
                    var configBuilder = new ConfigurationBuilder();
                    configBuilder.AddJsonFile(_configPath, optional: false);
                    var freshConfig = configBuilder.Build();
                    newConfig = freshConfig.GetSection(block.ConfigSectionName).Get(block.ConfigType);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to parse new config for {Block}", block.ConfigSectionName);
                    await block.StopAsync();
                    block.ReportError($"Invalid config: {ex.Message}");
                    continue;
                }

                try
                {
                    await block.StopAsync();
                    block.UpdateConfig(newConfig);
                    block.Start(appStopping);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to restart {Block}", block.ConfigSectionName);
                    block.ReportError($"Failed to restart: {ex.Message}");
                }
            }
        }
        catch (IOException) { }
        catch (JsonException) { }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking config changes");
        }
        finally
        {
            _checkLock.Release();
        }
    }
}
