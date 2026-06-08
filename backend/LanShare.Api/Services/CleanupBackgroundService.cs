using LanShare.Api.Options;
using Microsoft.Extensions.Options;

namespace LanShare.Api.Services;

public class CleanupBackgroundService(
    IServiceProvider services,
    IOptions<LanShareOptions> options,
    ILogger<CleanupBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(5, options.Value.CleanupIntervalMinutes));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(interval, stoppingToken);
                using var scope = services.CreateScope();
                var shares = scope.ServiceProvider.GetRequiredService<ShareService>();
                await shares.CleanupAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Cleanup failed");
            }
        }
    }
}
