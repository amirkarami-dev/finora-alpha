using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;

namespace Finora.Api.Infrastructure;

/// <summary>Cookie authentication, shaped for a single-page app rather than a server-rendered site.</summary>
internal static class AuthenticationSetup
{
    public const string CookieName = "finora.session";

    public static IHostApplicationBuilder AddFinoraAuthentication(this IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = CookieName;
                options.Cookie.HttpOnly = true;
                // Same-origin by design, so nothing legitimate is cross-site and the strictest
                // setting costs nothing while closing CSRF.
                options.Cookie.SameSite = SameSiteMode.Strict;
                options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
                    ? CookieSecurePolicy.SameAsRequest   // dev runs plain http on localhost
                    : CookieSecurePolicy.Always;

                options.ExpireTimeSpan = TimeSpan.FromDays(7);
                options.SlidingExpiration = true;

                // An API must answer 401/403. The default redirects to a login PAGE, which for
                // a fetch() call arrives as a 200 containing HTML — the SPA would parse it as
                // data and show an unrelated error instead of sending the user to sign in.
                options.Events.OnRedirectToLogin = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
            });

        builder.Services.AddAuthorization(options => options.AddPermissionPolicies());
        // Scoped, not singleton: the handler reads the caller's permissions through the
        // request's IdentityDbContext. See PermissionAuthorization for why it asks the database
        // rather than trusting a claim.
        builder.Services.AddScoped<IAuthorizationHandler, PermissionHandler>();

        return builder;
    }
}
