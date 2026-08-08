using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Finora.Erp.Infrastructure;

/// <summary>
/// The ERP module's composition. Called from the API and from the migrator — the only two places
/// allowed to know this module uses EF Core.
/// </summary>
public static class ErpModule
{
    /// <summary>The Aspire/connection-string name for the one Finora database.</summary>
    public const string ConnectionName = "finora";

    public static IHostApplicationBuilder AddErpModule(this IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.AddDbContext<ErpDbContext>(options =>
        {
            options.UseNpgsql(
                builder.Configuration.GetConnectionString(ConnectionName),
                npgsql => npgsql
                    // Its own history table inside its own schema. Without this, all three
                    // module contexts share public.__EFMigrationsHistory and each tries to
                    // apply the others' migrations.
                    .MigrationsHistoryTable("__EFMigrationsHistory", ErpDbContext.Schema)
                    .MigrationsAssembly(typeof(ErpModule).Assembly.FullName));

            options.UseSnakeCaseNamingConvention();
        });

        return builder;
    }
}
