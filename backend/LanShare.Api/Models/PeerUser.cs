namespace LanShare.Api.Models;

public class PeerUser
{
    public Guid Id { get; set; }
    public string DisplayName { get; set; } = "";
    public string SessionToken { get; set; } = "";
    public string? ConnectionId { get; set; }
    public DateTime LastSeenAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
