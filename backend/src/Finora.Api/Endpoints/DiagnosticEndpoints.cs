using Finora.BuildingBlocks.Domain;

namespace Finora.Api.Endpoints;

/// <summary>
/// Routes that deliberately fail, so the exception handler can be exercised through the real
/// pipeline — same middleware, same order, same serializer as production.
///
/// <para>
/// Mapped only when <c>Api:EnableDiagnosticEndpoints</c> is true, which nothing sets outside the
/// integration tests. The alternative — reproducing the pipeline inside the test host — tests a
/// pipeline nobody runs, and the ordering between the exception handler and the endpoints is
/// exactly the part most likely to be wrong.
/// </para>
/// </summary>
internal static class DiagnosticEndpoints
{
    public static IEndpointRouteBuilder MapDiagnosticEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/test").WithTags("Diagnostics").ExcludeFromDescription();

        group.MapGet("/domain-error", IResult () => throw new DomainException(
            "diagnostic-domain-error",
            new Dictionary<string, object?>
            {
                ["available"] = 55m,
                ["remainingMt"] = 27.5m,
            }));

        group.MapGet("/not-found", IResult () => throw new NotFoundException("invoice-not-found"));

        group.MapGet("/boom", IResult () => throw new InvalidOperationException(
            "secret-connection-string=Host=db;Password=hunter2"));

        return app;
    }
}
