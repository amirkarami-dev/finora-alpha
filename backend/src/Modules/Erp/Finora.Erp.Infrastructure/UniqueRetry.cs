using Finora.BuildingBlocks.Domain;
using Microsoft.EntityFrameworkCore;

namespace Finora.Erp.Infrastructure;

/// <summary>
/// The retry every code- or number-minting write shares: save, and on a unique-index collision
/// (two users minted the same value in the same second) let the caller mint again — once. A
/// second collision is reported as the given code rather than looped on, because two collisions
/// in a row means something other than timing.
///
/// <para>
/// Lives here, not on one service, because every server-assigned value — master-data codes and
/// trade-document numbers alike — races the same way: read the existing set, compute one past the
/// highest, save. <see cref="MasterData.MasterDataService"/> and
/// <see cref="Trade.InvoiceService"/> both call it.
/// </para>
/// </summary>
public static class UniqueRetry
{
    public static async Task SaveWithOneRetryAsync(
        DbContext db, Func<Task> mintAndAdd, string collisionCode, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(db);
        ArgumentNullException.ThrowIfNull(mintAndAdd);

        await mintAndAdd();
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException first) when (IsUniqueViolation(first))
        {
            db.ChangeTracker.Clear();
            await mintAndAdd();
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException second) when (IsUniqueViolation(second))
            {
                throw new DomainException(collisionCode);
            }
        }
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is Npgsql.PostgresException { SqlState: "23505" };
}
