using Microsoft.AspNetCore.SignalR;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

public interface IBlockServer
{
    string BlockName { get; }
    object LastUpdateDto { get; }
    void Init(WebApplication app);
    void Start(CancellationToken cancellationToken = default);
    void IncrementDashboardConnections();
    void DecrementDashboardConnections();
}

public interface IBlockServer<TDto> : IBlockServer
    where TDto : BaseDto
{
    TDto LastUpdate { get; }
}

public abstract class BlockServerBase<TDto> : IBlockServer<TDto>
    where TDto : BaseDto
{
    public interface IBlockHub
    {
        Task Update(TDto dto);
    }

    public class BlockHub : Hub<IBlockHub>
    {
        private readonly IBlockServer<TDto> _service;

        public BlockHub(IBlockServer<TDto> service) { _service = service; }

        public override async Task OnConnectedAsync()
        {
            ((BlockServerBase<TDto>)_service).IncrementConnections();
            if (_service.LastUpdate != null)
            {
                _service.LastUpdate.SentUtc = DateTime.UtcNow;
                await Clients.Caller.Update(_service.LastUpdate);
            }

            await base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception exception)
        {
            ((BlockServerBase<TDto>)_service).DecrementConnections();
            return base.OnDisconnectedAsync(exception);
        }
    }

    protected readonly ILogger Logger;
    protected readonly AppConfig AppConfig;

    private IHubContext<BlockHub, IBlockHub> _hub;
    private IHubContext<DashboardHub> _dashboardHub;
    private int _connectionCount;
    private int _dashboardConnectionCount;

    public string BlockName => typeof(TDto).Name.Replace("Dto", "");
    object IBlockServer.LastUpdateDto => LastUpdate;
    public TDto LastUpdate { get; private set; }

    public abstract void Start(CancellationToken cancellationToken = default);

    public BlockServerBase(IServiceProvider sp)
    {
        Logger = (ILogger)sp.GetRequiredService(typeof(ILogger<>).MakeGenericType(GetType()));
        _hub = sp.GetRequiredService<IHubContext<BlockHub, IBlockHub>>();
        _dashboardHub = sp.GetRequiredService<IHubContext<DashboardHub>>();
        AppConfig = sp.GetRequiredService<AppConfig>();
    }

    public virtual void Init(WebApplication app)
    {
        app.MapHub<BlockHub>($"/hub/{typeof(TDto).Name.Replace("Dto", "")}");
    }

    protected void SendUpdate(TDto dto)
    {
        dto.SentUtc = DateTime.UtcNow;
        dto.LocalOffsetHours = Util.GetUtcOffset(AppConfig.LocalTimezoneName);
        LastUpdate = dto;
        _hub.Clients.All.Update(dto);
        _dashboardHub.Clients.Group(BlockName).SendAsync("BlockUpdate", BlockName, dto);
    }

    internal void IncrementConnections() => Interlocked.Increment(ref _connectionCount);
    internal void DecrementConnections() => Interlocked.Decrement(ref _connectionCount);

    public void IncrementDashboardConnections() => Interlocked.Increment(ref _dashboardConnectionCount);
    public void DecrementDashboardConnections() => Interlocked.Decrement(ref _dashboardConnectionCount);

    protected bool IsAnyClientConnected() => _connectionCount > 0 || _dashboardConnectionCount > 0;
}
