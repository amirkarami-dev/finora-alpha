namespace Finora.Identity.Domain;

/// <summary>
/// Someone who can sign in.
///
/// <para>
/// Authorization hangs off roles, and roles are collections of permissions — never
/// <c>if (role == Admin)</c> scattered through the code. A role is a convenient bundle; the
/// permission is what is actually checked, so a new job title is a row rather than a release.
/// </para>
/// </summary>
public sealed class User
{
    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>Stored lowercase and unique — the login form must not care about capitals.</summary>
    public required string Email { get; set; }

    public required string Name { get; set; }

    /// <summary>PBKDF2, via ASP.NET Core's <c>PasswordHasher</c>. Never the password itself.</summary>
    public required string PasswordHash { get; set; }

    /// <summary>Rendered as the avatar background; carried over from the seeded demo accounts.</summary>
    public string AvatarColor { get; set; } = "#b87333";

    /// <summary>
    /// Deactivating is how a user is removed. Deleting one would orphan every record that
    /// records who created it, and this is a financial system — that history is the point.
    /// </summary>
    public bool Active { get; set; } = true;

    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? LastLoginAt { get; set; }

    public ICollection<UserRole> Roles { get; init; } = [];
}

/// <summary>A named bundle of permissions: CEO, Manager, Staff, Customer.</summary>
public sealed class Role
{
    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>
    /// The exact string the front end already uses (<c>CEO</c>, <c>Manager</c>, <c>Staff</c>,
    /// <c>Customer</c>), so the role a session reports needs no translation on either side.
    /// </summary>
    public required string Name { get; set; }

    public string? Description { get; set; }

    public ICollection<RolePermission> Permissions { get; init; } = [];
}

/// <summary>
/// One thing a user may do.
///
/// <para>
/// Today every permission is a route key — <c>dashboard</c>, <c>customers</c>, <c>payments</c> —
/// which is exactly what the SPA's sidebar and route guards already test, so behaviour is
/// unchanged on the day this ships. The code is a free-form string precisely so finer-grained
/// permissions (<c>erp.sales.invoice.create</c>) can be added later as rows, without a schema
/// change and without disturbing the ones already granted.
/// </para>
/// </summary>
public sealed class Permission
{
    public Guid Id { get; init; } = Guid.CreateVersion7();

    public required string Code { get; set; }

    public string? Description { get; set; }
}

public sealed class UserRole
{
    public Guid UserId { get; init; }
    public User? User { get; init; }

    public Guid RoleId { get; init; }
    public Role? Role { get; init; }
}

public sealed class RolePermission
{
    public Guid RoleId { get; init; }
    public Role? Role { get; init; }

    public Guid PermissionId { get; init; }
    public Permission? Permission { get; init; }
}
