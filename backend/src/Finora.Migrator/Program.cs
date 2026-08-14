using Finora.Erp.Infrastructure;
using Finora.Identity.Infrastructure;
using Finora.Migrator;
using Microsoft.EntityFrameworkCore;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();

// Each module registers its own context; the runner only knows there are targets.
builder.AddIdentityModule();
builder.Services.AddScoped(sp => new MigrationTarget(
    nameof(IdentityDbContext),
    async ct =>
    {
        var db = sp.GetRequiredService<IdentityDbContext>();
        await db.Database.MigrateAsync(ct);
        await sp.GetRequiredService<IdentitySeeder>().SeedAsync(ct);
    }));

builder.AddErpModule();
builder.Services.AddScoped(sp => new MigrationTarget(
    nameof(ErpDbContext),
    async ct => await sp.GetRequiredService<ErpDbContext>().Database.MigrateAsync(ct)));

builder.Services.AddHostedService<MigrationRunner>();

var host = builder.Build();
await host.RunAsync();
