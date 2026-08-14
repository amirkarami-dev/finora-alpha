using Finora.Identity.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Identity.Infrastructure;

/// <summary>
/// The <c>identity</c> schema.
///
/// <para>
/// One database, a schema per module. Schemas rather than separate databases because a
/// cross-module operation has to be one transaction; schemas rather than table prefixes because
/// they can be granted and revoked per module and each keeps its own migration history.
/// </para>
/// </summary>
public sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public const string Schema = "identity";

    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<User>(user =>
        {
            user.HasKey(u => u.Id);
            user.Property(u => u.Email).HasMaxLength(256).IsRequired();
            user.Property(u => u.Name).HasMaxLength(200).IsRequired();
            user.Property(u => u.PasswordHash).HasMaxLength(512).IsRequired();
            user.Property(u => u.AvatarColor).HasMaxLength(32).IsRequired();

            // Emails are stored lowercase, so a plain unique index is enough and the lookup can
            // use it — a case-insensitive comparison in the query would not.
            user.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Role>(role =>
        {
            role.HasKey(r => r.Id);
            role.Property(r => r.Name).HasMaxLength(64).IsRequired();
            role.Property(r => r.Description).HasMaxLength(400);
            role.HasIndex(r => r.Name).IsUnique();
        });

        modelBuilder.Entity<Permission>(permission =>
        {
            permission.HasKey(p => p.Id);
            permission.Property(p => p.Code).HasMaxLength(128).IsRequired();
            permission.Property(p => p.Description).HasMaxLength(400);
            permission.HasIndex(p => p.Code).IsUnique();
        });

        modelBuilder.Entity<UserRole>(userRole =>
        {
            userRole.HasKey(ur => new { ur.UserId, ur.RoleId });
            userRole.HasOne(ur => ur.User).WithMany(u => u!.Roles).HasForeignKey(ur => ur.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            userRole.HasOne(ur => ur.Role).WithMany().HasForeignKey(ur => ur.RoleId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<RolePermission>(rolePermission =>
        {
            rolePermission.HasKey(rp => new { rp.RoleId, rp.PermissionId });
            rolePermission.HasOne(rp => rp.Role).WithMany(r => r!.Permissions).HasForeignKey(rp => rp.RoleId)
                .OnDelete(DeleteBehavior.Cascade);
            rolePermission.HasOne(rp => rp.Permission).WithMany().HasForeignKey(rp => rp.PermissionId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
