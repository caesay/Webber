using System.Security.Cryptography;
using RT.Util;
using RT.Util.Paths;
using RT.Util.Streams;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

class ReloadBlockServer : BlockServerBase<ReloadBlockDto>
{
    private string _path;
    private FileSystemWatcher _watcher;
    private AutoResetEvent _event = new AutoResetEvent(false);

    public ReloadBlockServer(IServiceProvider sp, IWebHostEnvironment env)
        : base(sp)
    {
        _path = env.WebRootPath ?? env.ContentRootPath;
    }

    public override void Start(CancellationToken cancellationToken = default)
    {
        Logger.LogInformation($"Monitoring for changes: {_path}");
        _watcher = new FileSystemWatcher();
        _watcher.IncludeSubdirectories = true;
        _watcher.Path = _path;
        _watcher.Created += (_, e) => { _event.Set(); };
        _watcher.Changed += (_, e) => { _event.Set(); };
        _watcher.Deleted += (_, e) => { _event.Set(); };
        _watcher.EnableRaisingEvents = true;

        new Thread(thread) { IsBackground = true }.Start();
    }

    private void thread()
    {
        while (true)
        {
#if !DEBUG
            try
#endif
            {
                // Hash the metadata of everything in StaticPath
                var hashStream = new HashingStream(new VoidStream(), MD5.Create()); // no need to dispose of it
                var writer = new BinaryWriter(hashStream);
                foreach (var path in new PathManager(_path).GetFiles().OrderBy(f => f.FullName))
                {
                    writer.Write(path.FullName);
                    writer.Write(path.Length);
                    writer.Write(path.LastWriteTimeUtc.ToBinary());
                }
                var hash = hashStream.Hash.ToHex();

                Logger.LogDebug($"Server hash: {hash}");
                SendUpdate(new ReloadBlockDto { ValidUntilUtc = DateTime.UtcNow.AddYears(10), ServerHash = hash });

                // Sleep until we observe a change, but rescan fully every N hours even we didn't see any changes
                var minimumWait = DateTime.UtcNow.AddSeconds(2);
                _event.WaitOne(TimeSpan.FromHours(12));
                // Enforce a minimum wait time in case the watcher breaks and starts firing endlessly for whatever reason
                if (DateTime.UtcNow < minimumWait)
                    Thread.Sleep(minimumWait - DateTime.UtcNow);

                // Wait for 5 sec of no changes
                while (_event.WaitOne(TimeSpan.FromSeconds(5)))
                    ;
            }
#if !DEBUG
            catch (Exception ex)
            {
                Logger.LogError(ex, "Unhandled exception");
            }
#endif
        }
    }
}
