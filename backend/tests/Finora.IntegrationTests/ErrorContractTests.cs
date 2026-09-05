using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.BuildingBlocks.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Finora.IntegrationTests;

/// <summary>
/// Drives the real HTTP pipeline to prove the error contract the SPA depends on.
///
/// <para>
/// This is the highest-value test in the backend right now. Every one of the front end's ~85
/// error branches reads <c>e.message</c> as a bare code, and several read extra fields straight
/// off the error object. If the shape on the wire is wrong, the failure is not an exception —
/// it is a user seeing a raw slug, or a silently missing figure inside an otherwise sensible
/// sentence. Cheap to get wrong, hard to notice.
/// </para>
/// </summary>
public sealed class ErrorContractTests(ErrorContractTests.ThrowingApiFactory factory)
    : IClassFixture<ErrorContractTests.ThrowingApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task A_refused_business_rule_is_422_with_the_bare_code()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync(new Uri("/test/domain-error", UriKind.Relative));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("diagnostic-domain-error", problem.GetProperty("code").GetString());
    }

    [Fact]
    public async Task The_payload_is_flattened_into_extensions_so_the_SPA_can_read_it()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync(new Uri("/test/domain-error", UriKind.Relative));
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);

        // The front end does `err.available` / `err.remainingMt` directly on the caught Error.
        // Nesting these under a `details` object would break AddItemsModal's message without
        // breaking anything a compiler can see.
        Assert.Equal(55m, problem.GetProperty("available").GetDecimal());
        Assert.Equal(27.5m, problem.GetProperty("remainingMt").GetDecimal());
    }

    [Fact]
    public async Task A_missing_record_is_404_not_422()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync(new Uri("/test/not-found", UriKind.Relative));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("invoice-not-found", problem.GetProperty("code").GetString());
    }

    [Fact]
    public async Task An_unexpected_failure_is_500_and_leaks_nothing()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync(new Uri("/test/boom", UriKind.Relative));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("internal-error", body, StringComparison.Ordinal);
        // The message and stack belong in the log, not in a browser.
        Assert.DoesNotContain("secret-connection-string", body, StringComparison.Ordinal);
        Assert.DoesNotContain("StackTrace", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Every_code_the_API_serves_is_one_the_front_end_knows()
    {
        using var client = factory.CreateClient();

        var codes = await client.GetFromJsonAsync<string[]>(
            new Uri("/api/meta/error-codes", UriKind.Relative), Json);

        Assert.NotNull(codes);
        Assert.Equal(ErrorCodes.All.Count, codes.Length);
        Assert.Equal(codes.OrderBy(c => c, StringComparer.Ordinal), codes);
    }

    /// <summary>
    /// Boots the real API with the diagnostic routes switched on, so the exception handler is
    /// exercised through the production pipeline rather than a reconstruction of it.
    /// </summary>
    public sealed class ThrowingApiFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("Api:EnableDiagnosticEndpoints", "true");
        }
    }
}
