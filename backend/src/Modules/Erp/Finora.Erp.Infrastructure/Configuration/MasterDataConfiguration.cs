using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Finora.Erp.Infrastructure.Configuration;

internal sealed class PartnerConfiguration : IEntityTypeConfiguration<Partner>
{
    public void Configure(EntityTypeBuilder<Partner> builder)
    {
        builder.ToTable("partners");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasIdColumn();
        builder.Property(p => p.Name).HasMaxLength(200).IsRequired();
        builder.Property(p => p.Code).HasMaxLength(32).IsRequired();
        builder.HasIndex(p => p.Code).IsUnique();
    }
}

internal sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.ToTable("customers", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("customers", "default_currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("default_currency"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("customers", "customer_type"),
                ErpModelBuilderExtensions.EnumCheck<CustomerType>("customer_type"));
        });

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.Name).HasMaxLength(200).IsRequired();
        builder.Property(c => c.Code).HasMaxLength(32).IsRequired();
        builder.Property(c => c.DefaultCurrency).HasEnumColumn();
        builder.Property(c => c.CustomerType).HasEnumColumn();
        builder.Property(c => c.ContactName).HasMaxLength(200);
        builder.Property(c => c.Email).HasMaxLength(320);
        builder.Property(c => c.Phone).HasMaxLength(64);
        builder.Property(c => c.Country).HasMaxLength(100);
        builder.Property(c => c.CreditLimit).HasPrecision(18, 2);

        builder.HasIndex(c => c.Code).IsUnique();

        // At most one customer may hold the portal login. A partial unique index enforces it in
        // the database rather than only in the code path that happens to set it — two admins
        // granting it at once would otherwise both succeed.
        builder.HasIndex(c => c.PortalAccount)
            .IsUnique()
            .HasFilter("portal_account = true")
            .HasDatabaseName("ux_customers_portal_account");
    }
}

internal sealed class WarehouseConfiguration : IEntityTypeConfiguration<Warehouse>
{
    public void Configure(EntityTypeBuilder<Warehouse> builder)
    {
        builder.ToTable("warehouses");
        builder.HasKey(w => w.Id);
        builder.Property(w => w.Id).HasIdColumn();
        builder.Property(w => w.Name).HasMaxLength(200).IsRequired();
        builder.Property(w => w.Code).HasMaxLength(32).IsRequired();
        builder.Property(w => w.Location).HasMaxLength(200);
        builder.HasIndex(w => w.Code).IsUnique();
    }
}

internal sealed class CostCentreConfiguration : IEntityTypeConfiguration<CostCentre>
{
    public void Configure(EntityTypeBuilder<CostCentre> builder)
    {
        builder.ToTable("cost_centres");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.Name).HasMaxLength(200).IsRequired();
        builder.Property(c => c.Code).HasMaxLength(32).IsRequired();
        builder.Property(c => c.Description).HasMaxLength(400);
        builder.HasIndex(c => c.Code).IsUnique();
    }
}

internal sealed class FinancialAccountConfiguration : IEntityTypeConfiguration<FinancialAccount>
{
    public void Configure(EntityTypeBuilder<FinancialAccount> builder)
    {
        builder.ToTable("financial_accounts", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("financial_accounts", "type"),
                ErpModelBuilderExtensions.EnumCheck<FinancialAccountType>("type"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("financial_accounts", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency"));
            // A bank account without an account number or IBAN is not identifiable; a cash safe
            // has neither. The rule lives in the database so a future import cannot bypass it.
            t.HasCheckConstraint(
                "ck_financial_accounts_bank_fields",
                "type <> 'BANK' OR (account_number IS NOT NULL AND iban IS NOT NULL)");
        });

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasIdColumn();
        builder.Property(a => a.Name).HasMaxLength(200).IsRequired();
        builder.Property(a => a.Type).HasEnumColumn();
        builder.Property(a => a.Currency).HasEnumColumn();
        builder.Property(a => a.Description).HasMaxLength(400);
        builder.Property(a => a.AccountNumber).HasMaxLength(64);
        builder.Property(a => a.Iban).HasMaxLength(64);
        builder.Property(a => a.SwiftCode).HasMaxLength(32);
        builder.Property(a => a.Address).HasMaxLength(400);
    }
}

internal sealed class GoodConfiguration : IEntityTypeConfiguration<Good>
{
    public void Configure(EntityTypeBuilder<Good> builder)
    {
        builder.ToTable("goods", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("goods", "metal_type"),
                ErpModelBuilderExtensions.EnumCheck<MetalType>("metal_type"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("goods", "form"),
                "form IS NULL OR " + ErpModelBuilderExtensions.EnumCheck<GoodForm>("form"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("goods", "unit"),
                ErpModelBuilderExtensions.EnumCheck<GoodUnit>("unit"));
        });

        builder.HasKey(g => g.Id);
        builder.Property(g => g.Id).HasIdColumn();
        builder.Property(g => g.Name).HasMaxLength(200).IsRequired();
        builder.Property(g => g.Code).HasMaxLength(32).IsRequired();
        builder.Property(g => g.MetalType).HasEnumColumn();
        builder.Property(g => g.Form).HasEnumColumn();
        builder.Property(g => g.Unit).HasEnumColumn();
        builder.Property(g => g.HsCode).HasMaxLength(32);
        builder.Property(g => g.Description).HasMaxLength(400);
        builder.HasIndex(g => g.Code).IsUnique();
    }
}

internal sealed class ChargeCategoryConfiguration : IEntityTypeConfiguration<ChargeCategory>
{
    public void Configure(EntityTypeBuilder<ChargeCategory> builder)
    {
        builder.ToTable("charge_categories", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("charge_categories", "direction"),
                ErpModelBuilderExtensions.EnumCheck<ChargeDirection>("direction"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("charge_categories", "scope"),
                ErpModelBuilderExtensions.EnumCheck<ChargeScope>("scope"));
        });

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.Name).HasMaxLength(200).IsRequired();
        builder.Property(c => c.Code).HasMaxLength(32).IsRequired();
        builder.Property(c => c.Direction).HasEnumColumn();
        builder.Property(c => c.Scope).HasEnumColumn();
        builder.Property(c => c.Description).HasMaxLength(400);

        // Unique WITHIN a direction, not globally: EXPENSE and REVENUE may each have a "FRT",
        // and they are different things.
        builder.HasIndex(c => new { c.Direction, c.Code }).IsUnique();
    }
}

internal sealed class ErpSettingConfiguration : IEntityTypeConfiguration<ErpSetting>
{
    public void Configure(EntityTypeBuilder<ErpSetting> builder)
    {
        builder.ToTable("settings");
        builder.HasKey(s => s.Key);
        builder.Property(s => s.Key).HasMaxLength(64);
        builder.Property(s => s.Value).HasMaxLength(400).IsRequired();
    }
}
