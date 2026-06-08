using LanShare.Api.Models;
using LanShare.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace LanShare.Api.Security;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequireSessionAttribute : Attribute, IAsyncActionFilter
{
    public const string UserItemKey = "LanShareUser";

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var token = context.HttpContext.Request.Headers["X-Session-Token"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token))
        {
            context.Result = new UnauthorizedObjectResult(new { message = "لطفاً دوباره وارد شوید." });
            return;
        }

        var peers = context.HttpContext.RequestServices.GetRequiredService<PeerSessionService>();
        var user = await peers.GetByTokenAsync(token, context.HttpContext.RequestAborted);
        if (user is null)
        {
            context.Result = new UnauthorizedObjectResult(new { message = "نشست منقضی شده است." });
            return;
        }

        await peers.TouchAsync(user.Id, context.HttpContext.RequestAborted);
        context.HttpContext.Items[UserItemKey] = user;
        await next();
    }
}

public static class HttpContextSessionExtensions
{
    public static PeerUser GetSessionUser(this HttpContext ctx) =>
        (PeerUser)ctx.Items[RequireSessionAttribute.UserItemKey]!;
}
