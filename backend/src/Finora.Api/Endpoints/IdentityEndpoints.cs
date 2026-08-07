using System.Security.Claims;
using Finora.Identity.Application;
using Finora.Identity.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Finora.Api.Endpoints;

/// <summary>
/// Sign in, sign out, and "who am I".
///
/// <para>
/// The session is a cookie, not a token in the browser. The SPA and the API are served from one
/// origin (the vite proxy in development, one traefik host in production), so a cookie needs no
/// CORS and — being <c>HttpOnly</c> — cannot be read by script, which means an XSS cannot walk
/// off with a session the way it can with a token in <c>localStorage</c>. <c>SameSite=Strict</c>
/// closes CSRF for the same reason it is safe here: nothing cross-site is expected.
/// </para>
/// </summary>
internal static class IdentityEndpoints
{
    public const string UserIdClaim = "finora:uid";

    /// <summary>The session, or none. See the /me handler for why this is wrapped.</summary>
    internal sealed record CurrentUser(SessionUser? User);

    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/identity").WithTags("Identity");

        group.MapPost("/login", async (
            LoginRequest request,
            SignInService signIn,
            HttpContext context,
            CancellationToken cancellationToken) =>
        {
            var session = await signIn.SignInAsync(request, cancellationToken);

            var identity = new ClaimsIdentity(CookieAuthenticationDefaults.AuthenticationScheme);
            identity.AddClaim(new Claim(UserIdClaim, session.Id.ToString()));
            identity.AddClaim(new Claim(ClaimTypes.Name, session.Name));
            identity.AddClaim(new Claim(ClaimTypes.Email, session.Email));
            identity.AddClaim(new Claim(ClaimTypes.Role, session.Role));

            await context.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = true });

            return Results.Ok(session);
        })
            .AllowAnonymous()
            .WithName("Login")
            .WithSummary("Exchange credentials for a session cookie.");

        group.MapPost("/logout", async (HttpContext context) =>
        {
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        })
            .AllowAnonymous()
            .WithName("Logout")
            .WithSummary("Clear the session cookie.");

        group.MapGet("/me", async (
            ClaimsPrincipal principal,
            SignInService signIn,
            CancellationToken cancellationToken) =>
        {
            // Anonymous, and `null` rather than 401, because this endpoint's job is to answer
            // "is there a session" — and for a visitor the answer is "no", which is information,
            // not a failure. Returning 401 would make the browser log a console error on every
            // signed-out page load: noise in the console, and a failing smoke run. It reveals
            // nothing, since with no cookie there is nothing to reveal.
            // Wrapped in an object because ASP.NET writes an EMPTY body for a null result —
            // `Results.Ok(null)` and `Results.Json(null)` both send Content-Length: 0, which
            // makes the client's response.json() throw. A wrapper always has a body, always
            // has a schema, and says "no user" without an edge case.
            var id = principal.FindFirstValue(UserIdClaim);
            if (!Guid.TryParse(id, out var userId))
            {
                return Results.Ok(new CurrentUser(null));
            }

            // Authenticated by a cookie that outlived its user — deactivated, or deleted. The
            // cookie is stale, so treat it as no session at all.
            return Results.Ok(new CurrentUser(await signIn.BuildSessionAsync(userId, cancellationToken)));
        })
            .AllowAnonymous()
            .WithName("GetCurrentUser")
            .WithSummary("The signed-in user with their permissions, or null when signed out.");

        return app;
    }
}
