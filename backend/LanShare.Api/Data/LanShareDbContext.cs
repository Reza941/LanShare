using LanShare.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace LanShare.Api.Data;

public class LanShareDbContext(DbContextOptions<LanShareDbContext> options) : DbContext(options)
{
    public DbSet<PeerUser> Users => Set<PeerUser>();
    public DbSet<ShareBundle> ShareBundles => Set<ShareBundle>();
    public DbSet<ShareFile> ShareFiles => Set<ShareFile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PeerUser>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.SessionToken).IsUnique();
            e.Property(x => x.DisplayName).HasMaxLength(64).IsRequired();
            e.Property(x => x.SessionToken).HasMaxLength(64).IsRequired();
            e.Property(x => x.ConnectionId).HasMaxLength(128);
        });

        modelBuilder.Entity<ShareBundle>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Title).HasMaxLength(128).IsRequired();
            e.HasOne(x => x.Author).WithMany().HasForeignKey(x => x.AuthorId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.CreatedAt);
        });

        modelBuilder.Entity<ShareFile>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.OriginalFileName).HasMaxLength(512).IsRequired();
            e.Property(x => x.StoredFileName).HasMaxLength(128).IsRequired();
            e.Property(x => x.RelativePath).HasMaxLength(1024);
            e.Property(x => x.ContentType).HasMaxLength(256);
            e.HasOne(x => x.Bundle).WithMany(b => b.Files).HasForeignKey(x => x.BundleId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.BundleId);
        });
    }
}
