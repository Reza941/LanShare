using Microsoft.AspNetCore.Mvc;

namespace LanShare.Api.Controllers;

[ApiController]
[Route("api/console")]
public class ConsoleController : ControllerBase
{
    private static readonly object _lock = new();
    private static string? _instruction;
    private static string? _response;
    private static readonly string FilePath = Path.Combine(
        AppContext.BaseDirectory, "..", "..", "..", "console_state.json");

    [HttpPost]
    public IActionResult Post([FromBody] ConsoleRequest req)
    {
        lock (_lock)
        {
            _instruction = req.Text;
            _response = null;
        }
        Save();
        return Ok(new { ok = true });
    }

    [HttpGet("pending")]
    public IActionResult GetPending()
    {
        lock (_lock)
        {
            return Ok(new { instruction = _instruction, response = _response });
        }
    }

    [HttpPost("respond")]
    public IActionResult Respond([FromBody] ConsoleResponse req)
    {
        lock (_lock)
        {
            _response = req.Text;
        }
        Save();
        return Ok(new { ok = true });
    }

    [HttpGet("response")]
    public IActionResult GetResponse()
    {
        lock (_lock)
        {
            return Ok(new { text = _response });
        }
    }

    private void Save()
    {
        try
        {
            var dir = Path.GetDirectoryName(FilePath);
            if (dir != null && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);
            System.IO.File.WriteAllText(FilePath,
                System.Text.Json.JsonSerializer.Serialize(
                    new { instruction = _instruction, response = _response }));
        }
        catch { }
    }
}

public record ConsoleRequest(string Text);
public record ConsoleResponse(string Text);
