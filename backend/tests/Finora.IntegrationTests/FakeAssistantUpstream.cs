using System.Net;
using System.Text;
using System.Text.Json;

namespace Finora.IntegrationTests;

/// <summary>
/// Stands in for Liara. Records every request the API sends (headers and body) and answers with
/// whatever the current test scripted, so a test can assert what left the server without any
/// network. Registered once per fixture; tests set <see cref="Respond"/> and read
/// <see cref="LastRequest"/>.
/// </summary>
public sealed class FakeAssistantUpstream : HttpMessageHandler
{
    public sealed record Captured(string Authorization, string Body);

    public Captured? LastRequest { get; private set; }

    public Func<JsonDocument, HttpResponseMessage> Respond { get; set; } = _ => Text("OK");

    public static HttpResponseMessage Text(string content) => Json(new
    {
        choices = new[] { new { message = new { role = "assistant", content } } },
        usage = new { prompt_tokens = 12, completion_tokens = 3 },
    });

    public static HttpResponseMessage Json(object body, HttpStatusCode status = HttpStatusCode.OK) => new(status)
    {
        Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
    };

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
        LastRequest = new Captured(request.Headers.Authorization?.ToString() ?? "", body);
        using var doc = JsonDocument.Parse(string.IsNullOrEmpty(body) ? "{}" : body);
        return Respond(doc);
    }
}
