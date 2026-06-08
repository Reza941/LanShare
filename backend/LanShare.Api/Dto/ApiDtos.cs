namespace LanShare.Api.Dto;

public record JoinRequest(string DisplayName);
public record JoinResponse(Guid UserId, string Token, string DisplayName);

public record ShareFileDto(
    Guid Id,
    string OriginalFileName,
    long SizeBytes,
    string ContentType,
    string? RelativePath = null);

public record ShareBundleDto(
    Guid Id,
    string Title,
    string AuthorName,
    Guid AuthorId,
    DateTime CreatedAt,
    int FileCount,
    long TotalSizeBytes,
    IReadOnlyList<ShareFileDto> Files);

public record CreateShareResponse(Guid BundleId, string Message);
