using System.Net;
using System.Net.Sockets;
using LanShare.Api.Data;
using LanShare.Api.Hubs;
using LanShare.Api.Options;
using LanShare.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<LanShareOptions>(builder.Configuration.GetSection(LanShareOptions.SectionName));
var lanOpts = builder.Configuration.GetSection(LanShareOptions.SectionName).Get<LanShareOptions>() ?? new LanShareOptions();

builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(lanOpts.ListenPort);
});

builder.Services.AddDbContext<LanShareDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddScoped<PeerSessionService>();
builder.Services.AddScoped<ShareService>();
builder.Services.AddHostedService<CleanupBackgroundService>();

builder.Services.AddSignalR();
builder.Services.AddControllers();
builder.Services.AddCors(opt =>
{
    opt.AddDefaultPolicy(p => p
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()
        .SetIsOriginAllowed(_ => true));
});

builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
{
    o.MultipartBodyLengthLimit = (long)lanOpts.MaxFileSizeMb * 1024 * 1024;
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<LanShareDbContext>();
    await DatabaseInitializer.EnsureAsync(db);
}

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();
app.MapHub<ShareHub>("/hubs/share");
app.MapFallbackToFile("index.html");

var urls = GetLanAddresses(lanOpts.ListenPort);
app.Logger.LogInformation("========================================");
app.Logger.LogInformation("  LanShare آماده است!");
foreach (var url in urls)
    app.Logger.LogInformation("  مرورگر: {Url}", url);
app.Logger.LogInformation("========================================");

app.Run();

static List<string> GetLanAddresses(int port)
{
    var list = new List<string> { $"http://localhost:{port}" };
    try
    {
        foreach (var ip in Dns.GetHostAddresses(Dns.GetHostName()))
        {
            if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                list.Add($"http://{ip}:{port}");
        }
    }
    catch { /* ignore */ }
    return list.Distinct().ToList();
}
