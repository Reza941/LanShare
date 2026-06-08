using System.IO.Compression;
using LanShare.Api.Data;
using LanShare.Api.Dto;
using LanShare.Api.Hubs;
using LanShare.Api.Models;
using LanShare.Api.Options;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace LanShare.Api.Services;

public class ShareService(
    LanShareDbContext db,
    IWebHostEnvironment env,
    IOptions<LanShareOptions> options,
    IHubContext<ShareHub> hub,
    ILogger<ShareService> logger)
{
    private readonly LanShareOptions _opts = options.Value;

    private string UploadRoot =>
        Path.Combine(env.ContentRootPath, "App_Data", "uploads");

    public async Task<CreateShareResponse> CreateAsync(
        Guid authorId,
        string title,
        IReadOnlyList<IFormFile> files,
        IReadOnlyList<string>? paths,
        CancellationToken ct)
    {
        var name = title.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length < 2)
            throw new ArgumentException("نام محتوا باید حداقل ۲ کاراکتر باشد.");
        if (name.Length > 128)
            throw new ArgumentException("نام محتوا حداکثر ۱۲۸ کاراکتر است.");
        if (files.Count == 0)
            throw new ArgumentException("حداقل یک فایل انتخاب کنید.");

        var author = await db.Users.FindAsync([authorId], ct)
            ?? throw new InvalidOperationException("کاربر یافت نشد.");

        var maxBytes = (long)_opts.MaxFileSizeMb * 1024 * 1024;
        long total = 0;
        foreach (var f in files)
        {
            if (f.Length == 0)
                throw new ArgumentException($"فایل «{f.FileName}» خالی است.");
            total += f.Length;
        }
        if (total > maxBytes)
            throw new ArgumentException($"حداکثر حجم کل فایل‌ها {_opts.MaxFileSizeMb} مگابایت است.");

        Directory.CreateDirectory(UploadRoot);

        var bundle = new ShareBundle
        {
            Id = Guid.NewGuid(),
            AuthorId = authorId,
            Title = name,
            CreatedAt = DateTime.UtcNow
        };

        var order = 0;
        foreach (var (file, i) in files.Select((f, i) => (f, i)))
        {
            var storedName = $"{Guid.NewGuid():N}{Path.GetExtension(file.FileName)}";
            var fullPath = Path.Combine(UploadRoot, storedName);
            await using (var stream = new FileStream(fullPath, FileMode.CreateNew))
            {
                await file.CopyToAsync(stream, ct);
            }

            var relPath = paths is not null && i < paths.Count
                ? paths[i]?.Trim().Replace('\\', '/')
                : null;

            bundle.Files.Add(new ShareFile
            {
                Id = Guid.NewGuid(),
                BundleId = bundle.Id,
                OriginalFileName = Path.GetFileName(file.FileName),
                StoredFileName = storedName,
                RelativePath = string.IsNullOrWhiteSpace(relPath) ? null : relPath,
                ContentType = string.IsNullOrWhiteSpace(file.ContentType)
                    ? "application/octet-stream"
                    : file.ContentType,
                SizeBytes = file.Length,
                SortOrder = order++
            });
        }

        db.ShareBundles.Add(bundle);
        await db.SaveChangesAsync(ct);

        var dto = await GetByIdAsync(bundle.Id, ct);
        await hub.Clients.Group(ShareHub.GroupName).SendAsync("ShareCreated", dto, ct);

        logger.LogInformation("Share created {BundleId} by {Author} with {Count} files",
            bundle.Id, author.DisplayName, files.Count);

        return new CreateShareResponse(bundle.Id, "محتوا با موفقیت به اشتراک گذاشته شد.");
    }

    public async Task<List<ShareBundleDto>> ListAsync(int limit, CancellationToken ct)
    {
        var bundles = await db.ShareBundles
            .AsNoTracking()
            .Include(b => b.Author)
            .Include(b => b.Files)
            .OrderByDescending(b => b.CreatedAt)
            .Take(Math.Clamp(limit, 1, 200))
            .ToListAsync(ct);

        return bundles.Select(Map).ToList();
    }

    public async Task<ShareBundleDto?> GetByIdAsync(Guid id, CancellationToken ct)
    {
        var bundle = await db.ShareBundles
            .AsNoTracking()
            .Include(b => b.Author)
            .Include(b => b.Files)
            .FirstOrDefaultAsync(b => b.Id == id, ct);

        return bundle is null ? null : Map(bundle);
    }

    public async Task<(ShareFile file, string path)?> GetFileDownloadAsync(
        Guid fileId,
        CancellationToken ct)
    {
        var file = await db.ShareFiles
            .AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == fileId, ct);
        if (file is null) return null;

        var path = Path.Combine(UploadRoot, file.StoredFileName);
        if (!File.Exists(path)) return null;

        return (file, path);
    }

    public async Task<Stream?> DownloadZipAsync(Guid bundleId, CancellationToken ct)
    {
        var bundle = await db.ShareBundles
            .AsNoTracking()
            .Include(b => b.Files)
            .FirstOrDefaultAsync(b => b.Id == bundleId, ct);

        if (bundle is null || bundle.Files.Count == 0) return null;

        var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, true))
        {
            foreach (var f in bundle.Files.OrderBy(f => f.SortOrder))
            {
                var path = Path.Combine(UploadRoot, f.StoredFileName);
                if (!File.Exists(path)) continue;

                var entryName = string.IsNullOrEmpty(f.RelativePath) ? f.OriginalFileName : f.RelativePath;
                var entry = archive.CreateEntry(entryName, CompressionLevel.Fastest);
                using var entryStream = entry.Open();
                using var fileStream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
                await fileStream.CopyToAsync(entryStream, ct);
            }
        }

        stream.Seek(0, SeekOrigin.Begin);
        return stream;
    }

    public async Task<bool> DeleteAsync(Guid bundleId, Guid userId, CancellationToken ct)
    {
        var bundle = await db.ShareBundles
            .Include(b => b.Files)
            .FirstOrDefaultAsync(b => b.Id == bundleId, ct);

        if (bundle is null) return false;

        foreach (var f in bundle.Files)
        {
            var path = Path.Combine(UploadRoot, f.StoredFileName);
            if (File.Exists(path))
            {
                try { File.Delete(path); }
                catch (Exception ex) { logger.LogWarning(ex, "Could not delete {Path}", path); }
            }
        }

        db.ShareBundles.Remove(bundle);
        await db.SaveChangesAsync(ct);

        try
        {
            await hub.Clients.Group(ShareHub.GroupName).SendAsync("ShareDeleted", bundle.Id, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SignalR notification failed for delete {BundleId}", bundle.Id);
        }

        logger.LogInformation("Share deleted {BundleId} by {UserId}", bundle.Id, userId);
        return true;
    }

    public async Task<ShareBundleDto?> AddFilesAsync(
        Guid bundleId,
        Guid userId,
        IReadOnlyList<IFormFile> files,
        IReadOnlyList<string>? paths,
        CancellationToken ct)
    {
        var bundle = await db.ShareBundles
            .Include(b => b.Files)
            .Include(b => b.Author)
            .FirstOrDefaultAsync(b => b.Id == bundleId, ct);

        if (bundle is null) return null;

        var maxBytes = (long)_opts.MaxFileSizeMb * 1024 * 1024;
        long existingTotal = bundle.Files.Sum(f => f.SizeBytes);
        long newTotal = 0;
        foreach (var f in files)
        {
            if (f.Length == 0) continue;
            newTotal += f.Length;
        }
        if (existingTotal + newTotal > maxBytes)
            throw new InvalidOperationException($"حداکثر حجم کل فایل‌ها {_opts.MaxFileSizeMb} مگابایت است.");

        Directory.CreateDirectory(UploadRoot);
        var nextOrder = bundle.Files.Count > 0 ? bundle.Files.Max(f => f.SortOrder) + 1 : 0;

        foreach (var (file, i) in files.Select((f, i) => (f, i)))
        {
            if (file.Length == 0) continue;

            var storedName = $"{Guid.NewGuid():N}{Path.GetExtension(file.FileName)}";
            var fullPath = Path.Combine(UploadRoot, storedName);
            await using (var stream = new FileStream(fullPath, FileMode.CreateNew))
            {
                await file.CopyToAsync(stream, ct);
            }

            var relPath = paths is not null && i < paths.Count
                ? paths[i]?.Trim().Replace('\\', '/')
                : null;

            var sf = new ShareFile
            {
                Id = Guid.NewGuid(),
                BundleId = bundle.Id,
                OriginalFileName = Path.GetFileName(file.FileName),
                StoredFileName = storedName,
                RelativePath = string.IsNullOrWhiteSpace(relPath) ? null : relPath,
                ContentType = string.IsNullOrWhiteSpace(file.ContentType)
                    ? "application/octet-stream"
                    : file.ContentType,
                SizeBytes = file.Length,
                SortOrder = nextOrder + i
            };
            db.Add(sf);
        }

        await db.SaveChangesAsync(ct);
        var dto = await GetByIdAsync(bundle.Id, ct);

        try
        {
            await hub.Clients.Group(ShareHub.GroupName).SendAsync("ShareUpdated", dto, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SignalR notification failed for add-files {BundleId}", bundle.Id);
        }

        logger.LogInformation("Files added to {BundleId} by {UserId}", bundle.Id, userId);
        return dto;
    }

    public async Task<ShareBundleDto?> DeleteFileAsync(Guid fileId, Guid userId, CancellationToken ct)
    {
        var file = await db.ShareFiles
            .Include(f => f.Bundle)
            .ThenInclude(b => b.Files)
            .Include(f => f.Bundle.Author)
            .FirstOrDefaultAsync(f => f.Id == fileId, ct);

        if (file is null) return null;

        var path = Path.Combine(UploadRoot, file.StoredFileName);
        if (File.Exists(path))
        {
            try { File.Delete(path); }
            catch (Exception ex) { logger.LogWarning(ex, "Could not delete {Path}", path); }
        }

        var bundleId = file.BundleId;
        file.Bundle.Files.Remove(file);
        db.ShareFiles.Remove(file);
        await db.SaveChangesAsync(ct);

        var dto = await GetByIdAsync(bundleId, ct);

        try
        {
            await hub.Clients.Group(ShareHub.GroupName).SendAsync("ShareUpdated", dto, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SignalR notification failed for delete-file {FileId}", file.Id);
        }

        logger.LogInformation("File {FileId} deleted from {BundleId} by {UserId}", file.Id, file.BundleId, userId);
        return dto;
    }

    public async Task CleanupAsync(CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddHours(-_opts.FileRetentionHours);
        var old = await db.ShareBundles
            .Include(b => b.Files)
            .Where(b => b.CreatedAt < cutoff)
            .ToListAsync(ct);

        foreach (var bundle in old)
        {
            foreach (var f in bundle.Files)
            {
                var path = Path.Combine(UploadRoot, f.StoredFileName);
                if (File.Exists(path))
                {
                    try { File.Delete(path); }
                    catch (Exception ex) { logger.LogWarning(ex, "Could not delete {Path}", path); }
                }
            }
            db.ShareBundles.Remove(bundle);
        }

        if (old.Count > 0)
            await db.SaveChangesAsync(ct);

        var offlineCutoff = DateTime.UtcNow.AddDays(-7);
        var staleUsers = await db.Users.Where(u => u.LastSeenAt < offlineCutoff).ToListAsync(ct);
        if (staleUsers.Count > 0)
        {
            db.Users.RemoveRange(staleUsers);
            await db.SaveChangesAsync(ct);
        }
    }

    private static ShareBundleDto Map(ShareBundle b)
    {
        var files = b.Files
            .OrderBy(f => f.SortOrder)
            .Select(f => new ShareFileDto(f.Id, f.OriginalFileName, f.SizeBytes, f.ContentType, f.RelativePath))
            .ToList();

        return new ShareBundleDto(
            b.Id,
            b.Title,
            b.Author.DisplayName,
            b.AuthorId,
            b.CreatedAt,
            files.Count,
            files.Sum(f => f.SizeBytes),
            files);
    }
}
