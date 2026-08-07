using Finora.BuildingBlocks.Domain;
using Finora.Identity.Application;
using Finora.Identity.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Finora.Identity.Infrastructure;

/// <summary>
/// Validates credentials and assembles the session payload.
/// </summary>
public sealed class SignInService(IdentityDbContext db)
{
    private readonly PasswordHasher<User> _hasher = new();

    /// <summary>
    /// Verifies an email and password.
    ///
    /// <para>
    /// Every failure — unknown email, wrong password, deactivated account — returns the same
    /// <c>invalid-credentials</c>. Telling an attacker which of the three it was turns the login
    /// form into a way to enumerate who has an account here.
    /// </para>
    /// </summary>
    public async Task<SessionUser> SignInAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var email = request.Email.Trim().ToLowerInvariant();

        var user = await db.Users
            .Include(u => u.Roles)
            .SingleOrDefaultAsync(u => u.Email == email, cancellationToken);

        if (user is null)
        {
            // Hash anyway. Returning early on an unknown email makes that case measurably
            // faster than a wrong password, and the difference is enough to enumerate accounts.
            _hasher.HashPassword(new User { Email = email, Name = "", PasswordHash = "" }, request.Password);
            throw new DomainException("invalid-credentials");
        }

        var verification = _hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            throw new DomainException("invalid-credentials");
        }

        if (!user.Active)
        {
            throw new DomainException("invalid-credentials");
        }

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            // The hashing parameters have moved on since this password was set; upgrade it now
            // that we hold the plaintext, which is the only moment we can.
            user.PasswordHash = _hasher.HashPassword(user, request.Password);
        }

        user.LastLoginAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return await BuildSessionAsync(user.Id, cancellationToken)
            ?? throw new DomainException("invalid-credentials");
    }

    /// <summary>
    /// Rebuilds the session payload for an already-authenticated user, so a permission change
    /// takes effect on the next request rather than at the next sign-in.
    /// </summary>
    public async Task<SessionUser?> BuildSessionAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await db.Users
            .Where(u => u.Id == userId && u.Active)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.Name,
                u.AvatarColor,
                RoleName = u.Roles.Select(r => r.Role!.Name).FirstOrDefault(),
                Permissions = u.Roles
                    .SelectMany(r => r.Role!.Permissions.Select(p => p.Permission!.Code))
                    .Distinct()
                    .ToList(),
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (user?.RoleName is null)
        {
            return null;
        }

        return new SessionUser(
            user.Id,
            user.Email,
            user.Name,
            user.RoleName,
            user.AvatarColor,
            [.. user.Permissions.Order(StringComparer.Ordinal)],
            AccessCatalogue.RoleHome.GetValueOrDefault(user.RoleName, "/app/dashboard"));
    }
}
