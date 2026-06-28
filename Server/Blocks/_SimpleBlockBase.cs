using Webber.Client.Models;

namespace Webber.Server.Blocks;

public abstract class SimpleBlockServerBase<TDto> : BlockServerBase<TDto>
    where TDto : BaseDto, new()
{
    private readonly TimeSpan _interval;

    public SimpleBlockServerBase(IServiceProvider sp, TimeSpan interval) : base(sp)
    {
        _interval = interval;
    }

    public SimpleBlockServerBase(IServiceProvider sp, int intervalMs) : base(sp)
    {
        _interval = TimeSpan.FromMilliseconds(intervalMs);
    }

    protected abstract TDto Tick();

    protected virtual bool ShouldTick() => IsAnyClientConnected();

    public override void Start(CancellationToken cancellationToken = default)
    {
        Task.Run(() => RunAsync(cancellationToken));
    }

    private async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var start = DateTime.UtcNow;
            try
            {
                if (ShouldTick())
                {
                    var update = Tick();
                    if (update != null)
                        SendUpdate(update);
                }
            }
            catch (TellUserException ex)
            {
                Logger.LogWarning($"TellUser: {ex.Message}");
                SendUpdate((LastUpdate ?? new TDto()) with { ErrorMessage = ex.Message });
            }
#if !DEBUG
            catch (Exception ex)
            {
                Logger.LogError(ex, "Unhandled exception");
                SendUpdate((LastUpdate ?? new TDto()) with { ErrorMessage = ex.Message });
            }
#endif

            await SleepUntilNextTickAsync(start, ct);
        }
    }

    protected virtual async Task SleepUntilNextTickAsync(DateTime tickStartUtc, CancellationToken ct)
    {
        var delay = (tickStartUtc + _interval) - DateTime.UtcNow;
        if (delay > TimeSpan.Zero)
        {
            try { await Task.Delay(delay, ct); }
            catch (OperationCanceledException) { }
        }
    }
}

public class TellUserException : Exception
{
    public TellUserException(string message)
        : base(message)
    { }
}
