using System.Net;
using Finora.BuildingBlocks.Domain;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Finora.Api.Infrastructure;

/// <summary>
/// Turns exceptions into RFC 9457 ProblemDetails, preserving the front end's error contract.
///
/// <para>
/// The SPA reads <c>problem.extensions.code</c> as the bare machine code and copies every other
/// extension onto the thrown <c>Error</c>, so a component that today does
/// <c>catch (e) {'{'} if (e.message === 'qty-exceeds-remaining') show(e.available) {'}'}</c> keeps
/// working untouched. That is the whole reason the payload is flattened into extensions rather
/// than nested under a <c>details</c> object.
/// </para>
///
/// <para>
/// Status codes: a refused business rule is <b>422</b> (the request was well-formed, the domain
/// said no), a malformed request is <b>400</b>, a missing record is <b>404</b>. Anything
/// unhandled is a <b>500</b> that returns only a trace id — the details go to the log, not to
/// the browser.
/// </para>
/// </summary>
internal sealed partial class DomainExceptionHandler(
    IProblemDetailsService problemDetails,
    ILogger<DomainExceptionHandler> logger) : IExceptionHandler
{
    private const string ErrorTypeBase = "https://finora.metal-uae.com/errors/";

    public async ValueTask<bool> TryHandleAsync(
        HttpContext context,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (status, code, extensions) = Describe(exception);

        if (status == HttpStatusCode.InternalServerError)
        {
            LogUnhandled(logger, context.Request.Method, context.Request.Path, exception);
        }

        context.Response.StatusCode = (int)status;

        var problem = new ProblemDetails
        {
            Status = (int)status,
            Title = Title(status),
            Type = ErrorTypeBase + code,
            Instance = $"{context.Request.Method} {context.Request.Path}",
        };

        problem.Extensions["code"] = code;
        foreach (var (key, value) in extensions)
        {
            // "code" is reserved; a payload key of that name would silently replace the code
            // the client branches on.
            if (!string.Equals(key, "code", StringComparison.Ordinal))
            {
                problem.Extensions[key] = value;
            }
        }

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            Exception = exception,
            ProblemDetails = problem,
        });
    }

    private static (HttpStatusCode Status, string Code, IReadOnlyDictionary<string, object?> Extensions) Describe(
        Exception exception) => exception switch
    {
        DomainException domain =>
            (HttpStatusCode.UnprocessableEntity, domain.Code, domain.Payload),

        NotFoundException notFound =>
            (HttpStatusCode.NotFound, notFound.Code, Empty),

        ValidationException validation =>
            (HttpStatusCode.BadRequest,
             // Prefer the rule's own ErrorCode so a validator can raise a real domain code;
             // fall back to a generic one when it is just a shape complaint.
             validation.Errors.Select(e => e.ErrorCode).FirstOrDefault(c => !string.IsNullOrEmpty(c))
                ?? "invalid-request",
             new Dictionary<string, object?>
             {
                 ["errors"] = validation.Errors
                     .GroupBy(e => e.PropertyName)
                     .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray()),
             }),

        _ => (HttpStatusCode.InternalServerError, "internal-error", Empty),
    };

    private static readonly IReadOnlyDictionary<string, object?> Empty =
        new Dictionary<string, object?>();

    private static string Title(HttpStatusCode status) => status switch
    {
        HttpStatusCode.UnprocessableEntity => "The operation was refused by a business rule.",
        HttpStatusCode.NotFound => "The requested record does not exist.",
        HttpStatusCode.BadRequest => "The request was not valid.",
        _ => "An unexpected error occurred.",
    };

    [LoggerMessage(Level = LogLevel.Error, Message = "Unhandled exception on {Method} {Path}")]
    private static partial void LogUnhandled(ILogger logger, string method, PathString path, Exception exception);
}
