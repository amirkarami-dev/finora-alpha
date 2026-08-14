using Finora.BuildingBlocks.Domain;

namespace Finora.Api.Endpoints;

/// <summary>
/// Endpoints that describe the API itself rather than any business data.
/// </summary>
internal static class MetaEndpoints
{
    public static IEndpointRouteBuilder MapMetaEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/meta").WithTags("Meta");

        // Serves the error-code contract so CI can diff it against the codes api.ts throws.
        // A code the server can return but the client cannot translate would otherwise only
        // surface as a raw slug in front of a user.
        group.MapGet("/error-codes", () => Results.Ok(ErrorCodes.All))
            .WithName("GetErrorCodes")
            .WithSummary("Every business error code this API can return.");

        // Deliberately reachable without a database: it answers "is the process up and which
        // build is it", which is exactly what you need when the database is the thing that is
        // down. Readiness (including the database) is /health.
        group.MapGet("/version", () => Results.Ok(new
        {
            service = "finora-api",
            version = typeof(MetaEndpoints).Assembly.GetName().Version?.ToString() ?? "0.0.0",
            environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production",
        }))
            .WithName("GetVersion")
            .WithSummary("Service identity and build version.");

        return app;
    }
}
