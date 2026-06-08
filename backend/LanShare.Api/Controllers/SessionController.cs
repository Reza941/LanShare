using LanShare.Api.Dto;
using LanShare.Api.Security;
using LanShare.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace LanShare.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SessionController(PeerSessionService peers) : ControllerBase
{
    [HttpPost("join")]
    public async Task<ActionResult<JoinResponse>> Join([FromBody] JoinRequest request, CancellationToken ct)
    {
        try
        {
            var result = await peers.JoinAsync(request.DisplayName, ct);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("leave")]
    [RequireSession]
    public async Task<IActionResult> Leave(CancellationToken ct)
    {
        var user = HttpContext.GetSessionUser();
        await peers.LeaveAsync(user.Id, ct);
        return Ok(new { message = "خداحافظ!" });
    }

    [HttpGet("me")]
    [RequireSession]
    public ActionResult<object> Me()
    {
        var user = HttpContext.GetSessionUser();
        return Ok(new { user.Id, user.DisplayName });
    }
}
