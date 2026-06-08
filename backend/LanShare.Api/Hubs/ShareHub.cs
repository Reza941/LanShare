using LanShare.Api.Services;
using Microsoft.AspNetCore.SignalR;

namespace LanShare.Api.Hubs;

public class ShareHub(PeerSessionService peers) : Hub
{
    public const string GroupName = "lan-share";

    public override async Task OnConnectedAsync()
    {
        var user = await ResolveUserAsync();
        if (user is null)
        {
            Context.Abort();
            return;
        }

        await peers.SetConnectionAsync(user.Id, Context.ConnectionId, Context.ConnectionAborted);
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var user = await ResolveUserAsync();
        if (user is not null)
            await peers.SetConnectionAsync(user.Id, null, Context.ConnectionAborted);
        await base.OnDisconnectedAsync(exception);
    }

    public async Task Heartbeat()
    {
        var user = await ResolveUserAsync();
        if (user is null) return;
        await peers.TouchAsync(user.Id, Context.ConnectionAborted);
    }

    private async Task<Models.PeerUser?> ResolveUserAsync()
    {
        var http = Context.GetHttpContext();
        var token = http?.Request.Query["access_token"].FirstOrDefault()
            ?? http?.Request.Headers["X-Session-Token"].FirstOrDefault();

        if (string.IsNullOrWhiteSpace(token)) return null;
        return await peers.GetByTokenAsync(token, Context.ConnectionAborted);
    }
}
