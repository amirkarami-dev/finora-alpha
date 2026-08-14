using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Finora.Identity.Infrastructure;

/// <summary>
/// The Identity module's composition. Called from the API and from the migrator, which are the
/// only two places allowed to know that this module uses EF Core at all.
/// </summary>
public static class IdentityModule
{
    /// <summary>The Aspire/connection-string name for the one Finora database.</summary>
    public const string ConnectionName = "finora";

    public static IHostApplicationBuilder AddIdentityModule(this IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.AddDbContext<IdentityDbContext>(options =>
        {
            options.UseNpgsql(
                builder.Configuration.GetConnectionString(ConnectionName),
                npgsql => npgsql
                    // Without a schema here, all three module contexts share one
                    // public.__EFMigrationsHistory and each tries to apply the others'
                    // migrations. Each keeps its history inside its own schema.
                    .MigrationsHistoryTable("__EFMigrationsHistory", IdentityDbContext.Schema)
                    .MigrationsAssembly(typeof(IdentityModule).Assembly.FullName));

            options.UseSnakeCaseNamingConvention();
        });

        builder.Services.AddScoped<SignInService>();
        builder.Services.AddScoped<UserAdminService>();
        builder.Services.AddScoped<IdentitySeeder>();

        return builder;
    }
}
