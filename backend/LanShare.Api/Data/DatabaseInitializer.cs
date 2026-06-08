using Microsoft.EntityFrameworkCore;

namespace LanShare.Api.Data;

public static class DatabaseInitializer
{
    public static async Task EnsureAsync(LanShareDbContext db)
    {
        var hasNew = await db.Database
            .SqlQueryRaw<int>("SELECT COUNT(*) AS [Value] FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ShareBundles'")
            .FirstOrDefaultAsync();

        if (hasNew == 0)
        {
            await db.Database.EnsureDeletedAsync();
        }

        await db.Database.EnsureCreatedAsync();

        // add RelativePath column if missing (existing DB upgrade)
        try
        {
            await db.Database.ExecuteSqlRawAsync(
                "ALTER TABLE ShareFiles ADD RelativePath nvarchar(1024) NULL");
        }
        catch { }
    }
}
