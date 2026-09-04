using System.Text.Json;
using Finora.BuildingBlocks.Domain;

namespace Finora.Api.Assistant;

/// <summary>What the client may send (spec §3). Anything else is <c>assistant-bad-request</c>
/// with a <c>reason</c>, so a broken panel is diagnosable without reading server logs.</summary>
public static class AssistantRequestValidator
{
    public const string BadRequest = "assistant-bad-request";
    private static readonly HashSet<string> Modes = ["chat", "transcribe"];
    private static readonly HashSet<string> Languages = ["en", "ar", "fa", "ku"];
    private static readonly HashSet<string> Roles = ["user", "assistant", "tool"];

    public static void Validate(AssistantChatRequest request)
    {
        if (!Modes.Contains(request.Mode)) throw Bad("mode");
        if (!Languages.Contains(request.Language)) throw Bad("language");
        if (request.Messages.ValueKind != JsonValueKind.Array || request.Messages.GetArrayLength() == 0) throw Bad("messages");

        var sawUser = false;
        foreach (var message in request.Messages.EnumerateArray())
        {
            if (!message.TryGetProperty("role", out var roleEl) || roleEl.ValueKind != JsonValueKind.String) throw Bad("role");
            var role = roleEl.GetString()!;
            if (role == "system") continue;                 // dropped later, not an error
            if (!Roles.Contains(role)) throw Bad("role");
            sawUser |= role == "user";

            if (message.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
            {
                foreach (var part in content.EnumerateArray())
                {
                    var type = part.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
                    if (type == "text") continue;
                    if (type == "input_audio")
                    {
                        if (request.Mode != "transcribe") throw Bad("audio-not-allowed");
                        if (!part.TryGetProperty("input_audio", out var audio) || audio.ValueKind != JsonValueKind.Object) throw Bad("audio-shape");
                        var format = audio.TryGetProperty("format", out var f) && f.ValueKind == JsonValueKind.String ? f.GetString() : null;
                        if (format != "wav") throw Bad("audio-format");
                        continue;
                    }

                    throw Bad("content-part");
                }
            }
        }

        if (!sawUser) throw Bad("no-user-message");
        if (request.Mode == "transcribe" && request.Messages.GetArrayLength() != 1) throw Bad("transcribe-shape");
    }

    private static DomainException Bad(string reason) =>
        new(BadRequest, new Dictionary<string, object?> { ["reason"] = reason });
}

/// <summary>The request body. <c>Messages</c> stays raw JSON: it is forwarded as-is after the checks.</summary>
public sealed record AssistantChatRequest(string Mode, string Language, JsonElement Messages);
