using LanShare.Api.Data;
using LanShare.Api.Dto;
using LanShare.Api.Models;
using LanShare.Api.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LanShare.Api.Services;

public class PeerSessionService(
    LanShareDbContext db,
    IOptions<LanShareOptions> options,
    ILogger<PeerSessionService> logger)
{
    private readonly LanShareOptions _opts = options.Value;

    public async Task<JoinResponse> JoinAsync(string displayName, CancellationToken ct)
    {
        var name = displayName.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length < 2)
            throw new ArgumentException("نام باید حداقل ۲ کاراکتر باشد.");

        if (name.Length > 64)
            throw new ArgumentException("نام حداکثر ۶۴ کاراکتر است.");

        var token = Guid.NewGuid().ToString("N");
        var user = new PeerUser
        {
            Id = Guid.NewGuid(),
            DisplayName = name,
            SessionToken = token,
            LastSeenAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("User joined: {Name} ({Id})", name, user.Id);
        return new JoinResponse(user.Id, token, user.DisplayName);
    }

    public async Task<PeerUser?> GetByTokenAsync(string token, CancellationToken ct) =>
        await db.Users.FirstOrDefaultAsync(u => u.SessionToken == token, ct);

    public async Task TouchAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct);
        if (user is null) return;
        user.LastSeenAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task SetConnectionAsync(Guid userId, string? connectionId, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct);
        if (user is null) return;
        user.ConnectionId = connectionId;
        user.LastSeenAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task LeaveAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct);
        if (user is null) return;
        user.ConnectionId = null;
        user.LastSeenAt = DateTime.UtcNow.AddDays(-1);
        await db.SaveChangesAsync(ct);
    }
}
