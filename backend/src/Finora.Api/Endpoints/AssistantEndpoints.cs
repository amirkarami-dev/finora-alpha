using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Finora.Api.Assistant;
using Finora.Api.Infrastructure;
using Finora.BuildingBlocks.Domain;
using Finora.Identity.Infrastructure;
using Microsoft.Extensions.Options;

namespace Finora.Api.Endpoints;

public static partial class AssistantEndpoints
{
    public const string RateLimited = "assistant-rate-limited";

    public static IEndpointRouteBuilder MapAssistantEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp/assistant")
            .WithTags("ERP assistant")
            .RequirePermission("assistant");

        group.MapPost("/chat", async (
            AssistantChatRequest request,
            HttpContext context,
            ClaimsPrincipal principal,
            SignInService signIn,
            AssistantClient client,
            AssistantRateLimiter limiter,
            IOptions<AssistantOptions> options,
            ILogger<AssistantClient> logger,
            CancellationToken ct) =>
        {
            if (context.Request.ContentLength > options.Value.MaxBodyBytes)
            {
                throw new DomainException(AssistantRequestValidator.BadRequest, new Dictionary<string, object?> { ["reason"] = "too-large" });
            }

            AssistantRequestValidator.Validate(request);

            var userId = Guid.Parse(principal.FindFirstValue(IdentityEndpoints.UserIdClaim)!);
            if (!limiter.TryTake(userId, options.Value.RequestsPerHour))
            {
                throw new DomainException(RateLimited);
            }

            // Permissions come from the database, like every other permission check here, so a
            // revoked role loses its tools on the next question, not at the next sign-in.
            var session = await signIn.BuildSessionAsync(userId, ct)
                ?? throw new DomainException(AssistantRequestValidator.BadRequest, new Dictionary<string, object?> { ["reason"] = "no-session" });
            var permissions = session.Permissions.ToHashSet(StringComparer.Ordinal);

            var messages = new JsonArray
            {
                new JsonObject
                {
                    ["role"] = "system",
                    ["content"] = request.Mode == "transcribe" ? AssistantPrompt.Transcribe : AssistantPrompt.Chat(request.Language),
                },
            };
            foreach (var message in request.Messages.EnumerateArray())
            {
                if (message.GetProperty("role").GetString() == "system") continue;
                messages.Add(JsonNode.Parse(message.GetRawText()));
            }

            var body = new JsonObject
            {
                ["model"] = options.Value.Model,
                ["messages"] = messages,
                ["temperature"] = 0.2,
            };
            if (request.Mode == "chat")
            {
                var tools = AssistantTools.For(permissions);
                if (tools.Count > 0)
                {
                    body["tools"] = tools;
                    body["tool_choice"] = "auto";
                }
            }

            var started = TimeProvider.System.GetTimestamp();
            var reply = await client.ChatAsync(body, ct);
            var message0 = reply.GetProperty("choices")[0].GetProperty("message");
            var usage = reply.TryGetProperty("usage", out var u) ? u : default;
            var promptTokens = usage.ValueKind == JsonValueKind.Object && usage.TryGetProperty("prompt_tokens", out var p) ? p.GetInt32() : 0;
            var completionTokens = usage.ValueKind == JsonValueKind.Object && usage.TryGetProperty("completion_tokens", out var c) ? c.GetInt32() : 0;

            var elapsedMs = TimeProvider.System.GetElapsedTime(started).TotalMilliseconds;
            LogCall(logger, userId, request.Mode, promptTokens, completionTokens, elapsedMs);

            return Results.Ok(new AssistantChatResponse(message0, new AssistantUsage(promptTokens, completionTokens)));
        })
            .WithName("AssistantChat")
            .WithSummary("Forwards a conversation to the AI model with the server's rules and the caller's allowed tools.");

        return app;
    }

    public sealed record AssistantUsage(int PromptTokens, int CompletionTokens);
    public sealed record AssistantChatResponse(JsonElement Message, AssistantUsage Usage);

    [LoggerMessage(Level = LogLevel.Information, Message = "Assistant {Mode} for {UserId}: {PromptTokens}+{CompletionTokens} tokens in {Ms:F0} ms")]
    private static partial void LogCall(ILogger logger, Guid userId, string mode, int promptTokens, int completionTokens, double ms);
}
