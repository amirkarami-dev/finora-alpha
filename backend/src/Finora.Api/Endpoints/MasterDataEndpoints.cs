using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.MasterData;

namespace Finora.Api.Endpoints;

/// <summary>
/// Writes for the seven reference lists — the first slice of the SPA's api.ts to move here.
///
/// <para>
/// Three verbs per list, deliberately uniform: POST creates, PUT replaces, and
/// <c>PATCH .../active</c> toggles. There is no DELETE anywhere: master data is deactivated,
/// never removed, because a contract signed against a warehouse must stay readable after the
/// desk stops using that warehouse.
/// </para>
/// </summary>
internal static class MasterDataEndpoints
{
    public static IEndpointRouteBuilder MapMasterDataEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/erp").WithTags("ERP master data").RequireAuthorization();

        Map<Customer, CustomerInput>(group, "customers", "Customer",
            (s, i, c) => s.CreateCustomerAsync(i, c),
            (s, id, i, c) => s.UpdateCustomerAsync(id, i, c),
            (s, id, a, c) => s.SetCustomerActiveAsync(id, a, c));

        Map<Partner, PartnerInput>(group, "partners", "Partner",
            (s, i, c) => s.CreatePartnerAsync(i, c),
            (s, id, i, c) => s.UpdatePartnerAsync(id, i, c),
            (s, id, a, c) => s.SetPartnerActiveAsync(id, a, c));

        Map<Warehouse, WarehouseInput>(group, "warehouses", "Warehouse",
            (s, i, c) => s.CreateWarehouseAsync(i, c),
            (s, id, i, c) => s.UpdateWarehouseAsync(id, i, c),
            (s, id, a, c) => s.SetWarehouseActiveAsync(id, a, c));

        Map<CostCentre, CostCentreInput>(group, "cost-centres", "CostCentre",
            (s, i, c) => s.CreateCostCentreAsync(i, c),
            (s, id, i, c) => s.UpdateCostCentreAsync(id, i, c),
            (s, id, a, c) => s.SetCostCentreActiveAsync(id, a, c));

        Map<Good, GoodInput>(group, "goods", "Good",
            (s, i, c) => s.CreateGoodAsync(i, c),
            (s, id, i, c) => s.UpdateGoodAsync(id, i, c),
            (s, id, a, c) => s.SetGoodActiveAsync(id, a, c));

        Map<FinancialAccount, FinancialAccountInput>(group, "financial-accounts", "FinancialAccount",
            (s, i, c) => s.CreateFinancialAccountAsync(i, c),
            (s, id, i, c) => s.UpdateFinancialAccountAsync(id, i, c),
            (s, id, a, c) => s.SetFinancialAccountActiveAsync(id, a, c));

        Map<ChargeCategory, ChargeCategoryInput>(group, "charge-categories", "ChargeCategory",
            (s, i, c) => s.CreateChargeCategoryAsync(i, c),
            (s, id, i, c) => s.UpdateChargeCategoryAsync(id, i, c),
            (s, id, a, c) => s.SetChargeCategoryActiveAsync(id, a, c));

        return app;
    }

    /// <summary>
    /// The three routes for one list. Written once and parameterised because the seven lists
    /// differ only in their payload and their guards — spelling out twenty-one near-identical
    /// lambdas would hide that, and hide any one that had quietly drifted.
    /// </summary>
    private static void Map<TEntity, TInput>(
        IEndpointRouteBuilder group,
        string path,
        string name,
        Func<MasterDataService, TInput, CancellationToken, Task<MasterDataResult<TEntity>>> create,
        Func<MasterDataService, string, TInput, CancellationToken, Task<MasterDataResult<TEntity>>> update,
        Func<MasterDataService, string, bool, CancellationToken, Task<MasterDataResult<TEntity>>> setActive)
    {
        group.MapPost($"/{path}", async (
                TInput input, MasterDataService service, CancellationToken cancellationToken) =>
                Results.Ok(await create(service, input, cancellationToken)))
            .WithName($"Create{name}");

        group.MapPut($"/{path}/{{id}}", async (
                string id, TInput input, MasterDataService service, CancellationToken cancellationToken) =>
                Results.Ok(await update(service, id, input, cancellationToken)))
            .WithName($"Update{name}");

        group.MapPatch($"/{path}/{{id}}/active", async (
                string id, SetActiveInput input, MasterDataService service,
                CancellationToken cancellationToken) =>
                Results.Ok(await setActive(service, id, input.Active, cancellationToken)))
            .WithName($"Set{name}Active");
    }
}
