using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Webber.Client.Models;

namespace Webber.Server.Blocks;

public class DashboardHub : Hub
{
    private static readonly ConcurrentDictionary<string, HashSet<string>> _subscriptions = new();

    private readonly IEnumerable<IBlockServer> _blockServers;

    public DashboardHub(IEnumerable<IBlockServer> blockServers)
    {
        _blockServers = blockServers;
    }

    public async Task Subscribe(string[] blockNames)
    {
        var connectionId = Context.ConnectionId;

        // Remove existing subscriptions for this connection (handles re-subscribe)
        if (_subscriptions.TryRemove(connectionId, out var oldBlocks))
        {
            foreach (var oldBlock in oldBlocks)
            {
                await Groups.RemoveFromGroupAsync(connectionId, oldBlock);
                var oldServer = _blockServers.FirstOrDefault(s => s.BlockName == oldBlock);
                oldServer?.DecrementDashboardConnections();
            }
        }

        var newSubs = new HashSet<string>(blockNames);
        _subscriptions[connectionId] = newSubs;

        foreach (var blockName in blockNames)
        {
            await Groups.AddToGroupAsync(connectionId, blockName);

            var server = _blockServers.FirstOrDefault(s => s.BlockName == blockName);
            if (server != null)
            {
                server.IncrementDashboardConnections();
                var lastUpdate = server.LastUpdateDto;
                if (lastUpdate != null)
                {
                    ((BaseDto)lastUpdate).SentUtc = DateTime.UtcNow;
                    await Clients.Caller.SendAsync("BlockUpdate", blockName, lastUpdate);
                }
            }
        }
    }

    public override async Task OnDisconnectedAsync(Exception exception)
    {
        if (_subscriptions.TryRemove(Context.ConnectionId, out var blockNames))
        {
            foreach (var blockName in blockNames)
            {
                var server = _blockServers.FirstOrDefault(s => s.BlockName == blockName);
                server?.DecrementDashboardConnections();
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Returns the number of dashboard hub connections subscribed to a given block.
    /// </summary>
    public static int GetSubscriptionCount(string blockName)
    {
        var count = 0;
        foreach (var kvp in _subscriptions)
        {
            if (kvp.Value.Contains(blockName))
                count++;
        }
        return count;
    }
}
