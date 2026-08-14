using Finora.BuildingBlocks.Domain;
using Finora.Identity.Application;
using Finora.Identity.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Finora.Identity.Infrastructure;

/// <summary>
/// Creating, editing and deactivating the people who can sign in.
///
/// <para>
/// A user is never deleted, only deactivated — the same rule the rest of this system follows for
/// master data, and for a stronger reason here: rows all over the ERP record who entered them,
/// and a deleted account turns that history into a dangling id.
/// </para>
///
/// <para>
/// Roles are assigned, not authored. Which permissions a role carries lives in
/// <see cref="AccessCatalogue"/> and is reconciled into the database by <see cref="IdentitySeeder"/>
/// on every deploy, so a role edited here would be silently reverted on the next one. Assigning an
/// existing role is the operation this screen actually needs.
/// </para>
/// </summary>
public sealed class UserAdminService(IdentityDbContext db)
{
    private readonly PasswordHasher<User> _hasher = new();

    /// <summary>The shortest password this system accepts. Long enough to be worth typing, short
    /// enough that an administrator setting one for someone else over the phone will not give up
    /// and pick something worse.</summary>
    public const int MinimumPasswordLength = 8;

    public async Task<IReadOnlyList<UserSummary>> ListAsync(CancellationToken cancellationToken = default) =>
        await db.Users
            .AsNoTracking()
            .OrderBy(u => u.Email)
            .Select(u => new UserSummary(
                u.Id,
                u.Email,
                u.Name,
                u.Roles.Select(r => r.Role!.Name).FirstOrDefault() ?? string.Empty,
                u.AvatarColor,
                u.Active,
                u.CreatedAt,
                u.LastLoginAt))
            .ToListAsync(cancellationToken);

    public async Task<UserSummary> CreateAsync(
        CreateUserRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var email = Normalize(request.Email);
        if (email.Length == 0)
        {
            throw new DomainException(Codes.EmailRequired);
        }

        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            throw new DomainException(Codes.NameRequired);
        }

        if (await db.Users.AnyAsync(u => u.Email == email, cancellationToken))
        {
            throw new DomainException(Codes.DuplicateEmail);
        }

        var role = await FindRoleAsync(request.Role, cancellationToken);
        RequireUsablePassword(request.Password);

        var user = new User
        {
            Email = email,
            Name = name,
            AvatarColor = Colour(request.AvatarColor),
            PasswordHash = string.Empty,
        };
        user.PasswordHash = _hasher.HashPassword(user, request.Password);
        user.Roles.Add(new UserRole { UserId = user.Id, RoleId = role.Id });

        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);

        return await SingleAsync(user.Id, cancellationToken);
    }

    /// <summary>
    /// Renames, recolours and re-roles an account.
    ///
    /// <para>
    /// An administrator may not change their own role. Demoting yourself is the one edit here you
    /// cannot undo — the moment it saves you no longer hold <c>users</c>, and if you were the last
    /// one who did, nobody can put it back without a database console.
    /// </para>
    /// </summary>
    public async Task<UserSummary> UpdateAsync(
        Guid id, Guid actingUserId, UpdateUserRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var user = await LoadAsync(id, cancellationToken);

        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            throw new DomainException(Codes.NameRequired);
        }

        var role = await FindRoleAsync(request.Role, cancellationToken);
        var current = user.Roles.FirstOrDefault();

        if (current?.RoleId != role.Id)
        {
            if (id == actingUserId)
            {
                throw new DomainException(Codes.CannotChangeOwnRole);
            }

            // Replace rather than add. The schema allows several roles per user, but
            // BuildSessionAsync reports only the first, so a second one would be invisible
            // everywhere except the permission union — an account with quietly more access than
            // its own screen admits to.
            db.UserRoles.RemoveRange(user.Roles);
            user.Roles.Clear();
            user.Roles.Add(new UserRole { UserId = user.Id, RoleId = role.Id });
        }

        user.Name = name;
        user.AvatarColor = Colour(request.AvatarColor);
        await db.SaveChangesAsync(cancellationToken);

        return await SingleAsync(user.Id, cancellationToken);
    }

    /// <summary>
    /// Activates or deactivates an account. Deactivating is this system's delete.
    ///
    /// <para>Nobody may deactivate themselves: it would end the session performing the request,
    /// and the mistake is easiest to make on the row that is always in front of you.</para>
    /// </summary>
    public async Task<UserSummary> SetActiveAsync(
        Guid id, Guid actingUserId, bool active, CancellationToken cancellationToken = default)
    {
        if (id == actingUserId && !active)
        {
            throw new DomainException(Codes.CannotDeactivateSelf);
        }

        var user = await LoadAsync(id, cancellationToken);
        user.Active = active;
        await db.SaveChangesAsync(cancellationToken);

        return await SingleAsync(user.Id, cancellationToken);
    }

    /// <summary>An administrator setting a password for someone else.</summary>
    public async Task SetPasswordAsync(
        Guid id, string password, CancellationToken cancellationToken = default)
    {
        var user = await LoadAsync(id, cancellationToken);
        RequireUsablePassword(password);

        user.PasswordHash = _hasher.HashPassword(user, password);
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Someone changing their own password.
    ///
    /// <para>The current password is verified first. Without that, anyone who walked up to an
    /// unlocked screen could take the account permanently rather than borrow it.</para>
    /// </summary>
    public async Task ChangeOwnPasswordAsync(
        Guid id, ChangePasswordRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var user = await LoadAsync(id, cancellationToken);

        if (_hasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword)
            == PasswordVerificationResult.Failed)
        {
            throw new DomainException(Codes.CurrentPasswordIncorrect);
        }

        RequireUsablePassword(request.NewPassword);

        user.PasswordHash = _hasher.HashPassword(user, request.NewPassword);
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>The roles that can be assigned, in the order the catalogue declares them.</summary>
    public async Task<IReadOnlyList<string>> ListRolesAsync(CancellationToken cancellationToken = default)
    {
        var stored = await db.Roles.AsNoTracking().Select(r => r.Name).ToListAsync(cancellationToken);
        return [.. AccessCatalogue.RolePermissions.Keys.Where(stored.Contains)];
    }

    /* ---------------------------------- Shared ---------------------------------- */

    private static class Codes
    {
        public const string EmailRequired = "email-required";
        public const string NameRequired = "name-required";
        public const string DuplicateEmail = "duplicate-email";
        public const string UserNotFound = "user-not-found";
        public const string RoleNotFound = "role-not-found";
        public const string PasswordTooShort = "password-too-short";
        public const string CurrentPasswordIncorrect = "current-password-incorrect";
        public const string CannotDeactivateSelf = "cannot-deactivate-self";
        public const string CannotChangeOwnRole = "cannot-change-own-role";
    }

    private static string Normalize(string email) => email.Trim().ToLowerInvariant();

    private static string Colour(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? "#b87333" : trimmed;
    }

    private static void RequireUsablePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < MinimumPasswordLength)
        {
            throw new DomainException(
                Codes.PasswordTooShort,
                new Dictionary<string, object?> { ["minimum"] = MinimumPasswordLength });
        }
    }

    private async Task<User> LoadAsync(Guid id, CancellationToken cancellationToken) =>
        await db.Users.Include(u => u.Roles).SingleOrDefaultAsync(u => u.Id == id, cancellationToken)
        ?? throw new NotFoundException(Codes.UserNotFound);

    private async Task<Role> FindRoleAsync(string name, CancellationToken cancellationToken) =>
        await db.Roles.SingleOrDefaultAsync(r => r.Name == name, cancellationToken)
        ?? throw new DomainException(Codes.RoleNotFound);

    private async Task<UserSummary> SingleAsync(Guid id, CancellationToken cancellationToken) =>
        (await ListAsync(cancellationToken)).Single(u => u.Id == id);
}
