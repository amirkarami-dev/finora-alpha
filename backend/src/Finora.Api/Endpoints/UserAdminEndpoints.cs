using System.Security.Claims;
using Finora.Api.Infrastructure;
using Finora.BuildingBlocks.Domain;
using Finora.Identity.Application;
using Finora.Identity.Infrastructure;

namespace Finora.Api.Endpoints;

/// <summary>
/// User administration — the first endpoints in this API guarded by an actual permission rather
/// than by "has a cookie".
///
/// <para>
/// Every route under <c>/users</c> demands the <c>users</c> permission, held by CEO and Manager.
/// The check reads the database per request, so removing someone's access takes effect on their
/// next call rather than whenever their week-long cookie happens to expire.
/// </para>
///
/// <para>
/// Changing your own password sits here too but is deliberately outside that group: it needs a
/// session and nothing more. Requiring an administrator to change your own password would mean
/// the people most likely to need it are the ones who cannot.
/// </para>
/// </summary>
internal static class UserAdminEndpoints
{
    public static IEndpointRouteBuilder MapUserAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var users = app.MapGroup("/api/identity/users")
            .WithTags("User administration")
            .RequirePermission("users");

        users.MapGet("/", async (UserAdminService service, CancellationToken cancellationToken) =>
            Results.Ok(await service.ListAsync(cancellationToken)))
            .WithName("ListUsers")
            .WithSummary("Every account, active and inactive, oldest email first.");

        users.MapGet("/roles", async (UserAdminService service, CancellationToken cancellationToken) =>
            Results.Ok(await service.ListRolesAsync(cancellationToken)))
            .WithName("ListAssignableRoles")
            .WithSummary("The roles that can be assigned. Definitions live in code, not here.");

        users.MapPost("/", async (
                CreateUserRequest request, UserAdminService service, CancellationToken cancellationToken) =>
                Results.Ok(await service.CreateAsync(request, cancellationToken)))
            .WithName("CreateUser");

        users.MapPut("/{id:guid}", async (
                Guid id, UpdateUserRequest request, UserAdminService service, HttpContext context,
                CancellationToken cancellationToken) =>
                Results.Ok(await service.UpdateAsync(id, CallerId(context), request, cancellationToken)))
            .WithName("UpdateUser");

        users.MapPatch("/{id:guid}/active", async (
                Guid id, SetUserActiveRequest request, UserAdminService service, HttpContext context,
                CancellationToken cancellationToken) =>
                Results.Ok(await service.SetActiveAsync(id, CallerId(context), request.Active, cancellationToken)))
            .WithName("SetUserActive");

        users.MapPut("/{id:guid}/password", async (
                Guid id, SetPasswordRequest request, UserAdminService service,
                CancellationToken cancellationToken) =>
            {
                await service.SetPasswordAsync(id, request.Password, cancellationToken);
                return Results.NoContent();
            })
            .WithName("SetUserPassword")
            .WithSummary("An administrator setting someone else's password.");

        // Outside the group above: any signed-in account may change its own password, including
        // roles that hold no administrative permission at all.
        app.MapPost("/api/identity/password", async (
                ChangePasswordRequest request, UserAdminService service, HttpContext context,
                CancellationToken cancellationToken) =>
            {
                await service.ChangeOwnPasswordAsync(CallerId(context), request, cancellationToken);
                return Results.NoContent();
            })
            .WithTags("Identity")
            .RequireAuthorization()
            .WithName("ChangeOwnPassword");

        return app;
    }

    /// <summary>
    /// Who is asking, from the session cookie.
    ///
    /// <para>
    /// Taken from the claim rather than from the request body on purpose: the guards that stop an
    /// administrator deactivating themselves or demoting their own account are only worth
    /// anything if the identity they compare against cannot be supplied by the caller.
    /// </para>
    /// </summary>
    private static Guid CallerId(HttpContext context) =>
        Guid.TryParse(context.User.FindFirstValue(IdentityEndpoints.UserIdClaim), out var id)
            ? id
            : throw new NotFoundException("user-not-found");
}
