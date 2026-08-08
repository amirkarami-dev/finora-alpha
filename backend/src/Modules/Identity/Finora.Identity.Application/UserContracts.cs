namespace Finora.Identity.Application;

/// <summary>
/// One row of the user-administration list.
///
/// <para>
/// Deliberately not the <c>User</c> entity: that carries <c>PasswordHash</c>, and an admin screen
/// has no reason to move a hash across the wire — not even a well-guarded one.
/// </para>
/// </summary>
public sealed record UserSummary(
    Guid Id,
    string Email,
    string Name,
    string Role,
    string AvatarColor,
    bool Active,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt);

/// <summary>
/// A new account. The password is set here because there is no mail server in this deployment —
/// an administrator sets it and tells the person, which is the honest shape for an internal tool
/// rather than pretending an invite email will arrive.
/// </summary>
public sealed record CreateUserRequest(
    string Email,
    string Name,
    string Role,
    string? AvatarColor,
    string Password);

/// <summary>
/// An edit. The email is absent on purpose: it identifies the account, appears in the audit trail
/// people read, and changing it silently reassigns a login. Deactivate and create instead.
/// </summary>
public sealed record UpdateUserRequest(string Name, string Role, string? AvatarColor);

/// <summary>An administrator setting someone else's password. No current password: the point of
/// this is that the administrator does not know it.</summary>
public sealed record SetPasswordRequest(string Password);

/// <summary>Someone changing their own password. The current one is required — a stolen session
/// should not be enough to lock the real owner out of their account.</summary>
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

/// <summary>Activate or deactivate.</summary>
public sealed record SetUserActiveRequest(bool Active);
