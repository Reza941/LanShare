namespace LanShare.Api.Models;

public class ShareBundle
{
    public Guid Id { get; set; }
    public Guid AuthorId { get; set; }
    public PeerUser Author { get; set; } = null!;
    public string Title { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public ICollection<ShareFile> Files { get; set; } = [];
}

public class ShareFile
{
    public Guid Id { get; set; }
    public Guid BundleId { get; set; }
    public ShareBundle Bundle { get; set; } = null!;
    public string OriginalFileName { get; set; } = "";
    public string StoredFileName { get; set; } = "";
    public string? RelativePath { get; set; }
    public string ContentType { get; set; } = "application/octet-stream";
    public long SizeBytes { get; set; }
    public int SortOrder { get; set; }
}
