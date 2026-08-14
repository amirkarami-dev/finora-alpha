using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Finora.IntegrationTests;

/// <summary>
/// User administration over the real HTTP pipeline, including the permission check.
///
/// <para>
/// The authorization half matters more than the CRUD half. These are the first endpoints in this
/// API guarded by anything finer than "has a cookie", and the failure mode of a permission check
/// is silent: it does not throw or log, it just lets the wrong person through. Every test that
/// asserts a 403 below is guarding against a change that would quietly grant everyone access.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class UserAdminTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private sealed record UserSummary(
        Guid Id, string Email, string Name, string Role, string AvatarColor,
        bool Active, DateTimeOffset CreatedAt, DateTimeOffset? LastLoginAt);

    private static async Task<HttpClient> SignedInAsync(ApiFixture fixture, string email, string password)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var response = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative), new { email, password });
        response.EnsureSuccessStatusCode();
        return client;
    }

    private static Task<HttpClient> AsManagerAsync(ApiFixture fixture) =>
        SignedInAsync(fixture, "amir@finora.app", "demo1234");

    /// <summary>A unique email per test — the fixture's database is shared across the whole
    /// collection, so a fixed address would collide with a neighbour's leftovers.</summary>
    private static string FreshEmail(string tag) => $"{tag}-{Guid.NewGuid():N}@finora.test";

    private static object NewUser(string email, string role = "Staff", string password = "correct-horse") =>
        new { email, name = "Test Person", role, avatarColor = (string?)null, password };

    /* ------------------------------ Authorization ------------------------------ */

    [Fact]
    public async Task An_anonymous_caller_is_refused()
    {
        using var client = fixture.CreateClient();

        var response = await client.GetAsync(new Uri("/api/identity/users", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("staff@finora.app", "Staff@2026")]
    [InlineData("portal@alcometal.ae", "Alco@2026")]
    public async Task A_signed_in_account_without_the_permission_is_refused(string email, string password)
    {
        using var client = await SignedInAsync(fixture, email, password);

        var response = await client.GetAsync(new Uri("/api/identity/users", UriKind.Relative));

        // Not 401 — they are signed in. 403 is the honest answer, and the SPA routes the two
        // differently: one sends you to the login page, the other tells you it is not yours.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("amir@finora.app", "demo1234")]
    [InlineData("ceo@finora.app", "Ceo@2026")]
    public async Task The_roles_that_hold_users_can_list_them(string email, string password)
    {
        using var client = await SignedInAsync(fixture, email, password);

        var users = await client.GetFromJsonAsync<List<UserSummary>>(
            new Uri("/api/identity/users", UriKind.Relative), Json);

        Assert.NotNull(users);
        Assert.Contains(users, u => u.Email == "amir@finora.app");
    }

    [Fact]
    public async Task A_deactivated_account_loses_the_permission_without_signing_out()
    {
        using var admin = await AsManagerAsync(fixture);
        var email = FreshEmail("revoked");

        var created = await (await admin.PostAsJsonAsync(
            new Uri("/api/identity/users", UriKind.Relative), NewUser(email, "Manager")))
            .Content.ReadFromJsonAsync<UserSummary>(Json);

        // Their own live session, established while the account was still active.
        using var victim = await SignedInAsync(fixture, email, "correct-horse");
        Assert.Equal(HttpStatusCode.OK,
            (await victim.GetAsync(new Uri("/api/identity/users", UriKind.Relative))).StatusCode);

        await admin.PatchAsJsonAsync(
            new Uri($"/api/identity/users/{created!.Id}/active", UriKind.Relative), new { active = false });

        // The cookie is still valid for a week. The permission is read from the database on every
        // request precisely so this takes effect now rather than then.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await victim.GetAsync(new Uri("/api/identity/users", UriKind.Relative))).StatusCode);
    }

    /* ---------------------------------- CRUD ----------------------------------- */

    [Fact]
    public async Task A_created_user_can_sign_in_and_holds_its_roles_permissions()
    {
        using var admin = await AsManagerAsync(fixture);
        var email = FreshEmail("created");

        var response = await admin.PostAsJsonAsync(
            new Uri("/api/identity/users", UriKind.Relative), NewUser(email, "Staff"));
        response.EnsureSuccessStatusCode();

        var created = await response.Content.ReadFromJsonAsync<UserSummary>(Json);
        Assert.Equal(email, created!.Email);
        Assert.Equal("Staff", created.Role);
        Assert.True(created.Active);
        Assert.Null(created.LastLoginAt);

        using var theirs = await SignedInAsync(fixture, email, "correct-horse");
        var session = await theirs.GetFromJsonAsync<JsonElement>(
            new Uri("/api/identity/me", UriKind.Relative), Json);

        Assert.Equal("Staff", session.GetProperty("user").GetProperty("role").GetString());
    }

    [Fact]
    public async Task The_email_is_stored_lower_case_so_sign_in_matches()
    {
        using var admin = await AsManagerAsync(fixture);
        var email = FreshEmail("Mixed").ToUpperInvariant();

        var created = await (await admin.PostAsJsonAsync(
            new Uri("/api/identity/users", UriKind.Relative), NewUser(email)))
            .Content.ReadFromJsonAsync<UserSummary>(Json);

        Assert.Equal(email.ToLowerInvariant(), created!.Email);
    }

    [Fact]
    public async Task A_repeated_email_is_refused()
    {
        using var admin = await AsManagerAsync(fixture);
        var email = FreshEmail("twice");

        await admin.PostAsJsonAsync(new Uri("/api/identity/users", UriKind.Relative), NewUser(email));
        var second = await admin.PostAsJsonAsync(
            new Uri("/api/identity/users", UriKind.Relative), NewUser(email));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, second.StatusCode);
        Assert.Equal("duplicate-email", await CodeOf(second));
    }

    [Fact]
    public async Task Changing_a_users_role_replaces_it_rather_than_adding_one()
    {
        using var admin = await AsManagerAsync(fixture);
        var email = FreshEmail("promoted");

        var created = await (await admin.PostAsJsonAsync(
            new Uri("/api/identity/users", UriKind.Relative), NewUser(email, "Staff")))
            .Content.ReadFromJsonAsync<UserSummary>(Json);

        var updated = await (await admin.PutAsJsonAsync(
            new Uri($"/api/identity/users/{created!.Id}", UriKind.Relative),
            new { name = "Renamed Person", role = "Manager", avatarColor = "#3b82f6" }))
            .Content.ReadFromJsonAsync<UserSummary>(Json);

        Assert.Equal("Manager", updated!.Role);
        Assert.Equal("Renamed Person", updated.Name);

        // The session reports one role and the permission union covers all of them, so a leftover
        // Staff row would be invisible on screen while still granting access.
        using var theirs = await SignedInAsync(fixture, email, "correct-horse");
        var session = await theirs.GetFromJsonAsync<JsonElement>(
            new Uri("/api/identity/me", UriKind.Relative), Json);
        var permissions = session.GetProperty("user").GetProperty("permissions")
            .EnumerateArray().Select(p => p.GetString()).ToList();

        Assert.Contains("payments", permissions);          // Manager holds it
        Assert.Equal(permissions.Count, permissions.Distinct().Count());
        Assert.Equal("Manager", session.GetProperty("user").GetProperty("role").GetString());
    }

    [Fact]
    public async Task An_unknown_role_is_refused()
    {
        using var admin = await AsManagerAsync(fixture);

        var response = await admin.PostAsJsonAsync(
            new Uri("/api/identity/users", UriKind.Relative), NewUser(FreshEmail("badrole"), "Sysadmin"));

        Assert.Equal("role-not-found", await CodeOf(response));
    }

    [Fact]
    public async Task Only_the_catalogued_roles_are_offered()
    {
        using var admin = await AsManagerAsync(fixture);

        var roles = await admin.GetFromJsonAsync<List<string>>(
            new Uri("/api/identity/users/roles", UriKind.Relative), Json);

        Assert.Equal(["CEO", "Manager", "Staff", "Customer"], roles);
    }

    /* -------------------------------- Passwords -------------------------------- */

    [Fact]
    public async Task An_administrator_can_reset_a_password()
    {
        using var admin = await AsManagerAsync(fixture);
        var email = FreshEmail("reset");

        var created = await (await admin.PostAsJsonAsync(
            new Uri("/api/identity/users", UriKind.Relative), NewUser(email)))
            .Content.ReadFromJsonAsync<UserSummary>(Json);

        var reset = await admin.PutAsJsonAsync(
            new Uri($"/api/identity/users/{created!.Id}/password", UriKind.Relative),
            new { password = "a-different-one" });
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);

        using var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var old = await client.PostAsJsonAsync(
            new Uri("/api/identity/login", UriKind.Relative), new { email, password = "correct-horse" });
        Assert.Equal("invalid-credentials", await CodeOf(old));

        using var theirs = await SignedInAsync(fixture, email, "a-different-one");   // throws if refused
        Assert.NotNull(theirs);
    }

    [Fact]
    public async Task Anyone_can_change_their_own_password_but_must_know_the_current_one()
    {
        using var admin = await AsManagerAsync(fixture);
        var email = FreshEmail("selfserve");

        // Customer holds no administrative permission at all — the point of this endpoint.
        await admin.PostAsJsonAsync(
            new Uri("/api/identity/users", UriKind.Relative), NewUser(email, "Customer"));

        using var theirs = await SignedInAsync(fixture, email, "correct-horse");

        var wrong = await theirs.PostAsJsonAsync(
            new Uri("/api/identity/password", UriKind.Relative),
            new { currentPassword = "not-it", newPassword = "brand-new-one" });
        Assert.Equal("current-password-incorrect", await CodeOf(wrong));

        var right = await theirs.PostAsJsonAsync(
            new Uri("/api/identity/password", UriKind.Relative),
            new { currentPassword = "correct-horse", newPassword = "brand-new-one" });
        Assert.Equal(HttpStatusCode.NoContent, right.StatusCode);

        using var again = await SignedInAsync(fixture, email, "brand-new-one");
        Assert.NotNull(again);
    }

    [Fact]
    public async Task A_short_password_is_refused_and_says_the_minimum()
    {
        using var admin = await AsManagerAsync(fixture);

        var response = await admin.PostAsJsonAsync(
            new Uri("/api/identity/users", UriKind.Relative),
            NewUser(FreshEmail("short"), password: "abc"));

        // Read once: the response content is a stream, and asking for it twice reads a closed one.
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("password-too-short", problem.GetProperty("code").GetString());

        // The payload carries the number so the message can say it rather than hardcoding one
        // that drifts from the rule.
        Assert.Equal(8, problem.GetProperty("minimum").GetInt32());
    }

    /* ------------------------------ Self-protection ---------------------------- */

    [Fact]
    public async Task An_administrator_cannot_deactivate_themselves()
    {
        using var admin = await AsManagerAsync(fixture);
        var me = (await admin.GetFromJsonAsync<List<UserSummary>>(
            new Uri("/api/identity/users", UriKind.Relative), Json))!
            .Single(u => u.Email == "amir@finora.app");

        var response = await admin.PatchAsJsonAsync(
            new Uri($"/api/identity/users/{me.Id}/active", UriKind.Relative), new { active = false });

        Assert.Equal("cannot-deactivate-self", await CodeOf(response));
    }

    [Fact]
    public async Task An_administrator_cannot_change_their_own_role()
    {
        using var admin = await AsManagerAsync(fixture);
        var me = (await admin.GetFromJsonAsync<List<UserSummary>>(
            new Uri("/api/identity/users", UriKind.Relative), Json))!
            .Single(u => u.Email == "amir@finora.app");

        var response = await admin.PutAsJsonAsync(
            new Uri($"/api/identity/users/{me.Id}", UriKind.Relative),
            new { name = me.Name, role = "Staff", avatarColor = me.AvatarColor });

        // Demoting yourself is the one edit here that cannot be undone from inside the app.
        Assert.Equal("cannot-change-own-role", await CodeOf(response));
    }

    [Fact]
    public async Task Renaming_yourself_is_still_allowed()
    {
        using var admin = await AsManagerAsync(fixture);
        var me = (await admin.GetFromJsonAsync<List<UserSummary>>(
            new Uri("/api/identity/users", UriKind.Relative), Json))!
            .Single(u => u.Email == "amir@finora.app");

        var response = await admin.PutAsJsonAsync(
            new Uri($"/api/identity/users/{me.Id}", UriKind.Relative),
            new { name = me.Name, role = me.Role, avatarColor = me.AvatarColor });

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Editing_someone_who_is_not_there_is_a_404()
    {
        using var admin = await AsManagerAsync(fixture);

        var response = await admin.PutAsJsonAsync(
            new Uri($"/api/identity/users/{Guid.NewGuid()}", UriKind.Relative),
            new { name = "Ghost", role = "Staff", avatarColor = (string?)null });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("user-not-found", await CodeOf(response));
    }

    private static async Task<string?> CodeOf(HttpResponseMessage response)
    {
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        return problem.GetProperty("code").GetString();
    }
}
