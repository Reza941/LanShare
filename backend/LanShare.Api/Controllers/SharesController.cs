using LanShare.Api.Security;
using LanShare.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace LanShare.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SharesController(ShareService shares) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int limit = 50, CancellationToken ct = default)
    {
        var list = await shares.ListAsync(limit, ct);
        return Ok(list);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var bundle = await shares.GetByIdAsync(id, ct);
        return bundle is null
            ? NotFound(new { message = "محتوا یافت نشد." })
            : Ok(bundle);
    }

    [HttpPost]
    [RequireSession]
    [RequestSizeLimit(long.MaxValue)]
    [RequestFormLimits(MultipartBodyLengthLimit = long.MaxValue)]
    public async Task<IActionResult> Create(
        [FromForm] string title,
        [FromForm] List<IFormFile> files,
        [FromForm] List<string>? paths,
        CancellationToken ct)
    {
        var user = HttpContext.GetSessionUser();
        try
        {
            var result = await shares.CreateAsync(user.Id, title, files, paths, ct);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("files/{fileId:guid}/download")]
    public async Task<IActionResult> DownloadFile(Guid fileId, CancellationToken ct)
    {
        var result = await shares.GetFileDownloadAsync(fileId, ct);
        if (result is null)
            return NotFound(new { message = "فایل یافت نشد." });

        var (file, path) = result.Value;
        var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        return File(stream, file.ContentType, file.OriginalFileName);
    }

    [HttpGet("{id:guid}/download-zip")]
    public async Task<IActionResult> DownloadZip(Guid id, CancellationToken ct)
    {
        var stream = await shares.DownloadZipAsync(id, ct);
        if (stream is null)
            return NotFound(new { message = "محتوا یافت نشد." });

        var bundle = await shares.GetByIdAsync(id, ct);
        return File(stream, "application/zip", $"{bundle!.Title}.zip");
    }

    [HttpDelete("{id:guid}")]
    [RequireSession]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        try
        {
            var user = HttpContext.GetSessionUser();
            var ok = await shares.DeleteAsync(id, user.Id, ct);
            if (!ok)
                return NotFound(new { message = "محتوا یافت نشد." });

            return Ok(new { message = "محتوا حذف شد." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"خطا در حذف: {ex.Message}" });
        }
    }

    [HttpPost("{id:guid}/files")]
    [RequireSession]
    [RequestSizeLimit(long.MaxValue)]
    [RequestFormLimits(MultipartBodyLengthLimit = long.MaxValue)]
    public async Task<IActionResult> AddFiles(
        Guid id,
        [FromForm] List<IFormFile> files,
        [FromForm] List<string>? paths,
        CancellationToken ct)
    {
        try
        {
            var user = HttpContext.GetSessionUser();
            var dto = await shares.AddFilesAsync(id, user.Id, files, paths, ct);
            if (dto is null)
                return NotFound(new { message = "محتوا یافت نشد." });

            return Ok(dto);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("files/{fileId:guid}")]
    [RequireSession]
    public async Task<IActionResult> DeleteFile(Guid fileId, CancellationToken ct)
    {
        try
        {
            var user = HttpContext.GetSessionUser();
            var dto = await shares.DeleteFileAsync(fileId, user.Id, ct);
            if (dto is null)
                return NotFound(new { message = "فایل یافت نشد." });

            return Ok(dto);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"خطا در حذف فایل: {ex.Message}" });
        }
    }
}
