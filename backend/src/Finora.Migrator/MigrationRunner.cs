namespace Finora.Migrator;

/// <summary>
/// Applies pending migrations for every module's DbContext, then stops the process.
///
/// <para>
/// A separate one-shot service rather than a startup hook in the API, for two reasons: two API
/// replicas starting together would otherwise race each other's schema change, and a migration
/// failure should stop a deployment rather than leave an API serving traffic against a schema
/// it does not match.
/// </para>
///
/// <para>
/// Each module owns its own DbContext and its own <c>__EFMigrationsHistory</c> table inside its
/// own schema, so the three migration sets stay independent. Contexts are registered here as
/// they arrive — Identity in phase 2, ERP in phase 3.
/// </para>
/// </summary>
internal sealed partial class MigrationRunner(
    IServiceProvider services,
    IHostApplicationLifetime lifetime,
    ILogger<MigrationRunner> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var scope = services.CreateScope();

            // No DbContexts yet — the schema lands in phases 2 and 3. The runner exists now so
            // the orchestration, the wait-for-completion ordering and the deployment step are
            // proven before there is a schema whose failure would be expensive.
            var targets = scope.ServiceProvider.GetServices<MigrationTarget>().ToList();

            foreach (var target in targets)
            {
                LogMigrating(logger, target.Name);
                await target.MigrateAsync(stoppingToken);
            }

            LogComplete(logger, targets.Count);
        }
        catch (Exception ex)
        {
            LogFailed(logger, ex);
            Environment.ExitCode = 1;
        }
        finally
        {
            lifetime.StopApplication();
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Migrating {Context}…")]
    private static partial void LogMigrating(ILogger logger, string context);

    [LoggerMessage(Level = LogLevel.Information, Message = "Migrations complete ({Count} context(s)).")]
    private static partial void LogComplete(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Error, Message = "Migration failed; the deployment should stop here.")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}

/// <summary>
/// One migratable context. Modules register an instance of this rather than exposing their
/// DbContext type to the migrator, which keeps the migrator free of module references it would
/// otherwise need one of per module.
/// </summary>
internal sealed record MigrationTarget(string Name, Func<CancellationToken, Task> Migrate)
{
    public Task MigrateAsync(CancellationToken cancellationToken) => Migrate(cancellationToken);
}
