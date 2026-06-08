namespace LanShare.Api.Options;

public class LanShareOptions
{
    public const string SectionName = "LanShare";

    public int ListenPort { get; set; } = 5080;
    public int MaxFileSizeMb { get; set; } = 500;
    public int UserOfflineSeconds { get; set; } = 90;
    public int FileRetentionHours { get; set; } = 48;
    public int CleanupIntervalMinutes { get; set; } = 15;
}
