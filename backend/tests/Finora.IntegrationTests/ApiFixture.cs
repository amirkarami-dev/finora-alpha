using Finora.Erp.Infrastructure;
using Finora.Identity.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace Finora.IntegrationTests;

/// <summary>
/// A real PostgreSQL 17 in a container, migrated and seeded, hosting the whole API for every
/// integration test.
///
/// <para>
/// Not an in-memory provider: schemas, snake_case naming, unique indexes and the migration
/// history table are exactly the things an in-memory provider does not have, and they are the
/// things most likely to be wrong. The image matches the server's 17.10 line so a behaviour
/// difference between here and production cannot be blamed on the version.
/// </para>
/// </summary>
public sealed class ApiFixture : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17-alpine")
        .WithDatabase("finora")
        .Build();

    // Implemented explicitly: xUnit's IAsyncLifetime returns Task, while the base
    // WebApplicationFactory already has a DisposeAsync returning ValueTask. Explicit
    // implementation lets both exist without one hiding the other.
    async Task IAsyncLifetime.InitializeAsync()
    {
        await _postgres.StartAsync();

        using var scope = Services.CreateScope();

        // Every module's schema, not just Identity's: the ERP tests write into `erp`, and a
        // fixture that migrates one context leaves the other's tables simply absent.
        await scope.ServiceProvider.GetRequiredService<IdentityDbContext>().Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<ErpDbContext>().Database.MigrateAsync();

        await scope.ServiceProvider.GetRequiredService<IdentitySeeder>().SeedAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:finora", _postgres.GetConnectionString());
        // The seeded accounts need their published demo passwords here, exactly as in local
        // development. Production leaves this off and the seeder creates them unusable instead.
        builder.UseSetting("Identity:AllowDemoPasswords", "true");
    }
}
