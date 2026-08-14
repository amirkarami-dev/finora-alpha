using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Identity.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>
/// Sign-in, the session cookie, and what each role is granted.
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class IdentityTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private sealed record CurrentUser(Session? User);

    private sealed record Session(
        Guid Id, string Email, string Name, string Role, string AvatarColor,
        string[] Permissions, string Home);

    private static HttpClient NewClient(ApiFixture fixture) =>
        fixture.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
        });

    public static TheoryData<string, string, string, int> SeededLogins()
    {
        var data = new TheoryData<string, string, string, int>();
        foreach (var account in SeededAccounts.All)
        {
            data.Add(account.Email, account.DemoPassword, account.Role,
                AccessCatalogue.RolePermissions[account.Role].Length);
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(SeededLogins))]
    public async Task Each_seeded_account_signs_in_with_its_own_permissions(
        string email, string password, string role, int permissionCount)
    {
        using var client = NewClient(fixture);

        var response = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative), new { email, password }, Json);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var session = await response.Content.ReadFromJsonAsync<Session>(Json);
        Assert.NotNull(session);
        Assert.Equal(role, session.Role);
        Assert.Equal(permissionCount, session.Permissions.Length);
        Assert.Equal(AccessCatalogue.RoleHome[role], session.Home);
    }

    [Fact]
    public async Task Permissions_match_the_catalogue_exactly_for_every_role()
    {
        foreach (var account in SeededAccounts.All)
        {
            using var client = NewClient(fixture);
            var response = await client.PostAsJsonAsync(
                new Uri("/api/identity/login", UriKind.Relative),
                new { email = account.Email, password = account.DemoPassword }, Json);

            var session = await response.Content.ReadFromJsonAsync<Session>(Json);

            Assert.Equal(
                AccessCatalogue.RolePermissions[account.Role].Order(StringComparer.Ordinal),
                session!.Permissions.Order(StringComparer.Ordinal));
        }
    }

    [Fact]
    public async Task Staff_holds_baseInfo_but_not_the_charge_pages()
    {
        // The one grant most easily broken by a careless edit: Staff keeps its cost-centre
        // capability under baseInfo, while expenses/revenues/claims stay Manager-only.
        using var client = NewClient(fixture);
        var response = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative),
            new { email = "staff@finora.app", password = "Staff@2026" }, Json);

        var session = await response.Content.ReadFromJsonAsync<Session>(Json);

        Assert.Contains("baseInfo", session!.Permissions);
        Assert.DoesNotContain("expenses", session.Permissions);
        Assert.DoesNotContain("revenues", session.Permissions);
        Assert.DoesNotContain("claims", session.Permissions);
    }

    [Theory]
    [InlineData("amir@finora.app", "wrong-password")]
    [InlineData("nobody@example.com", "demo1234")]
    public async Task Bad_credentials_all_look_the_same(string email, string password)
    {
        // An unknown email and a wrong password must be indistinguishable, or the login form
        // becomes a way to find out who has an account here.
        using var client = NewClient(fixture);

        var response = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative), new { email, password }, Json);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("invalid-credentials", problem.GetProperty("code").GetString());
    }

    [Fact]
    public async Task The_email_is_matched_case_insensitively()
    {
        using var client = NewClient(fixture);

        var response = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative),
            new { email = "  AMIR@Finora.App  ", password = "demo1234" }, Json);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task The_session_cookie_is_HttpOnly_and_SameSite_Strict()
    {
        using var client = NewClient(fixture);

        var response = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative),
            new { email = "amir@finora.app", password = "demo1234" }, Json);

        var setCookie = Assert.Single(response.Headers.GetValues("Set-Cookie"));

        Assert.Contains("finora.session", setCookie, StringComparison.Ordinal);
        // HttpOnly is what stops an XSS from reading the session; SameSite=Strict is what stops
        // another site from riding it.
        Assert.Contains("httponly", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", setCookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Me_needs_a_session_and_returns_it()
    {
        using var client = NewClient(fixture);

        // A visitor gets 200 with a null body, not 401: "nobody" is the answer, not a failure,
        // and a 401 here would log a console error on every signed-out page load.
        var anonymous = await client.GetFromJsonAsync<CurrentUser>(new Uri("/api/identity/me", UriKind.Relative), Json);
        Assert.Null(anonymous!.User);

        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "ceo@finora.app", password = "Ceo@2026" }, Json);

        var current = await client.GetFromJsonAsync<CurrentUser>(new Uri("/api/identity/me", UriKind.Relative), Json);
        Assert.Equal("CEO", current!.User!.Role);
        Assert.Equal("/app/executive", current.User.Home);
    }

    [Fact]
    public async Task Logging_out_ends_the_session()
    {
        using var client = NewClient(fixture);

        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "amir@finora.app", password = "demo1234" }, Json);
        var signedIn = await client.GetFromJsonAsync<CurrentUser>(new Uri("/api/identity/me", UriKind.Relative), Json);
        Assert.NotNull(signedIn!.User);

        await client.PostAsync(new Uri("/api/identity/logout", UriKind.Relative), null);

        var after = await client.GetFromJsonAsync<CurrentUser>(new Uri("/api/identity/me", UriKind.Relative), Json);
        Assert.Null(after!.User);
    }

    [Fact]
    public async Task Seeding_twice_changes_nothing()
    {
        // The migrator reseeds on every deploy, so this has to be idempotent — a second run
        // duplicating grants or users would break silently and grow forever.
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();

        var before = (db.Users.Count(), db.Roles.Count(), db.Permissions.Count(), db.RolePermissions.Count());
        await scope.ServiceProvider.GetRequiredService<IdentitySeeder>().SeedAsync();
        var after = (db.Users.Count(), db.Roles.Count(), db.Permissions.Count(), db.RolePermissions.Count());

        Assert.Equal(before, after);
    }
}

[CollectionDefinition(nameof(ApiCollection))]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>;
