using Webber.Client.Models;

namespace Webber.Server.Blocks;

public abstract class SimpleBlockServerBase<TDto> : BlockServerBase<TDto>
    where TDto : BaseDto, new()
{
    protected TimeSpan _interval;

    public SimpleBlockServerBase(IServiceProvider sp, TimeSpan interval) : base(sp)
    {
        _interval = interval;
    }

    public SimpleBlockServerBase(IServiceProvider sp, int intervalMs) : base(sp)
    {
        _interval = TimeSpan.FromMilliseconds(intervalMs);
    }

    protected abstract TDto Tick();

    protected virtual bool ShouldTick() => LastUpdate == null || IsAnyClientConnected();

    public override void ReportError(string errorMessage)
    {
        SendUpdate((LastUpdate ?? new TDto()) with { ErrorMessage = errorMessage });
    }

    public override void Start(CancellationToken cancellationToken = default)
    {
        _blockCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _stoppedTcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Task.Run(() => RunAsync(_blockCts.Token));
    }

    private async Task RunAsync(CancellationToken ct)
    {
        try
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
        finally
        {
            SignalStopped();
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
