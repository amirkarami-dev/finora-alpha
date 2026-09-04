using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Finora.BuildingBlocks.Domain;
using Microsoft.Extensions.Options;

namespace Finora.Api.Assistant;

/// <summary>One call to the OpenAI-compatible upstream. Any failure — network, non-2xx, bad JSON —
/// becomes <c>assistant-unavailable</c>; the upstream's own body is logged, never returned, because
/// it can echo the request (and so the key's presence) back.</summary>
public sealed partial class AssistantClient(HttpClient http, IOptions<AssistantOptions> options, ILogger<AssistantClient> logger)
{
    public const string Unavailable = "assistant-unavailable";

    public async Task<JsonElement> ChatAsync(JsonObject body, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (string.IsNullOrWhiteSpace(settings.ApiKey))
        {
            LogNoKey(logger);
            throw new DomainException(Unavailable);
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, settings.BaseUrl.TrimEnd('/') + "/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiKey);
        request.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

        try
        {
            using var response = await http.SendAsync(request, cancellationToken);
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                // The upstream can echo the request back (e.g. in an error message), so the key
                // must never reach the log even truncated.
                var redacted = string.IsNullOrEmpty(settings.ApiKey) ? text : text.Replace(settings.ApiKey, "***", StringComparison.Ordinal);
                LogUpstream(logger, (int)response.StatusCode, redacted.Length > 500 ? redacted[..500] : redacted);
                throw new DomainException(Unavailable);
            }

            using var doc = JsonDocument.Parse(text);
            return doc.RootElement.Clone();
        }
        catch (Exception ex) when ((ex is HttpRequestException or TaskCanceledException or JsonException) && !cancellationToken.IsCancellationRequested)
        {
            LogFailure(logger, ex);
            throw new DomainException(Unavailable);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Assistant:ApiKey is not configured; the assistant is unavailable")]
    private static partial void LogNoKey(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Assistant upstream answered {Status}: {Body}")]
    private static partial void LogUpstream(ILogger logger, int status, string body);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Assistant upstream call failed")]
    private static partial void LogFailure(ILogger logger, Exception exception);
}
