namespace Finora.Identity.Application;

/// <summary>Credentials from the sign-in form.</summary>
public sealed record LoginRequest(string Email, string Password);

/// <summary>
/// Who the caller is and what they may do — the whole answer in one payload, so the SPA can
/// render its sidebar and guards without a second round trip.
/// </summary>
public sealed record SessionUser(
    Guid Id,
    string Email,
    string Name,
    string Role,
    string AvatarColor,
    /// <summary>Route keys, matching what the front end's guards already test.</summary>
    IReadOnlyList<string> Permissions,
    /// <summary>Where this role lands after signing in.</summary>
    string Home);
