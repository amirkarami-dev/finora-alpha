namespace Finora.Api.Assistant;

/// <summary>Bound from the <c>Assistant</c> section. The key is a secret: environment
/// variable <c>Assistant__ApiKey</c> on the server, user-secrets or the shell in development.</summary>
public sealed class AssistantOptions
{
    public const string Section = "Assistant";

    public string BaseUrl { get; set; } = "https://ai.liara.ir/api/6a9ab0caefdce39fec0da290/v1";
    public string Model { get; set; } = "google/gemini-2.5-flash";
    public string ApiKey { get; set; } = "";
    public int TimeoutSeconds { get; set; } = 60;
    public int RequestsPerHour { get; set; } = 60;
    public long MaxBodyBytes { get; set; } = 4 * 1024 * 1024;
}
