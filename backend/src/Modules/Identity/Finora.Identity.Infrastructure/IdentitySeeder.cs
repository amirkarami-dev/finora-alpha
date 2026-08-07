using Finora.Identity.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Finora.Identity.Infrastructure;

/// <summary>
/// Brings the roles, permissions and seeded accounts up to date. Idempotent: it adds what is
/// missing and re-grants what has drifted, so it can run on every deploy.
/// </summary>
public sealed partial class IdentitySeeder(
    IdentityDbContext db,
    IConfiguration configuration,
    ILogger<IdentitySeeder> logger)
{
    private readonly PasswordHasher<User> _hasher = new();

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        await SeedPermissionsAsync(cancellationToken);
        await SeedRolesAsync(cancellationToken);
        await SeedUsersAsync(cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedPermissionsAsync(CancellationToken cancellationToken)
    {
        var existing = await db.Permissions
            .Select(p => p.Code)
            .ToListAsync(cancellationToken);

        var missing = AccessCatalogue.AllPermissions.Except(existing, StringComparer.Ordinal);

        foreach (var code in missing)
        {
            db.Permissions.Add(new Permission { Code = code });
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedRolesAsync(CancellationToken cancellationToken)
    {
        var permissions = await db.Permissions.ToDictionaryAsync(p => p.Code, p => p.Id, StringComparer.Ordinal, cancellationToken);
        var roles = await db.Roles.Include(r => r.Permissions).ToDictionaryAsync(r => r.Name, StringComparer.Ordinal, cancellationToken);

        foreach (var (roleName, codes) in AccessCatalogue.RolePermissions)
        {
            if (!roles.TryGetValue(roleName, out var role))
            {
                role = new Role { Name = roleName };
                db.Roles.Add(role);
                await db.SaveChangesAsync(cancellationToken);
            }

            var granted = role.Permissions.Select(rp => rp.PermissionId).ToHashSet();

            foreach (var code in codes)
            {
                var permissionId = permissions[code];
                if (granted.Add(permissionId))
                {
                    db.RolePermissions.Add(new RolePermission { RoleId = role.Id, PermissionId = permissionId });
                }
            }

            // Grants the catalogue no longer lists are revoked, so removing a permission from
            // the catalogue actually removes it rather than leaving it granted forever.
            var wanted = codes.Select(c => permissions[c]).ToHashSet();
            var stale = role.Permissions.Where(rp => !wanted.Contains(rp.PermissionId)).ToList();
            if (stale.Count > 0)
            {
                db.RolePermissions.RemoveRange(stale);
                LogRevoked(logger, stale.Count, roleName);
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedUsersAsync(CancellationToken cancellationToken)
    {
        var roles = await db.Roles.ToDictionaryAsync(r => r.Name, r => r.Id, StringComparer.Ordinal, cancellationToken);
        var existing = await db.Users
            .Select(u => u.Email)
            .ToListAsync(cancellationToken);

        foreach (var account in SeededAccounts.All)
        {
            var email = account.Email.ToLowerInvariant();
            if (existing.Contains(email, StringComparer.Ordinal))
            {
                continue;
            }

            var password = ResolvePassword(account);
            var user = new User
            {
                Email = email,
                Name = account.Name,
                AvatarColor = account.AvatarColor,
                PasswordHash = string.Empty,
            };
            user.PasswordHash = _hasher.HashPassword(user, password);

            db.Users.Add(user);
            db.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = roles[account.Role] });
        }
    }

    /// <summary>
    /// The demo password is only ever used when <c>Identity:AllowDemoPasswords</c> is on, which
    /// is set in development and nowhere else. In production each account's password must come
    /// from configuration; without one, the account is still created but with a random secret
    /// nobody holds, so it is unusable until somebody sets a real password. Seeding a published
    /// password into a production database would be the same as having no password at all.
    /// </summary>
    private string ResolvePassword(SeededAccount account)
    {
        var configured = configuration[$"Identity:SeedPasswords:{account.Email}"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        if (configuration.GetValue<bool>("Identity:AllowDemoPasswords"))
        {
            return account.DemoPassword;
        }

        LogUnusablePassword(logger, account.Email);
        return Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Revoked {Count} stale permission(s) from {Role}.")]
    private static partial void LogRevoked(ILogger logger, int count, string role);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "No password configured for {Email}; it was created with an unusable random one. " +
                  "Set Identity:SeedPasswords:{Email} and reseed, or set the password another way.")]
    private static partial void LogUnusablePassword(ILogger logger, string email);
}
