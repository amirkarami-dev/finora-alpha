using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Finora.Erp.Infrastructure.Configuration;

internal sealed class ContractConfiguration : IEntityTypeConfiguration<Contract>
{
    public void Configure(EntityTypeBuilder<Contract> builder)
    {
        builder.ToTable("contracts", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("contracts", "contract_type"),
                ErpModelBuilderExtensions.EnumCheck<ContractType>("contract_type"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("contracts", "status"),
                ErpModelBuilderExtensions.EnumCheck<ContractStatus>("status"));
        });

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.CustomerId).HasIdColumn();
        builder.Property(c => c.ContractType).HasEnumColumn();
        builder.Property(c => c.Status).HasEnumColumn();
        builder.Property(c => c.Destination).HasMaxLength(200).IsRequired();
        builder.Property(c => c.Notes).HasMaxLength(2000);

        builder.HasOne(c => c.Customer).WithMany(c => c!.Contracts)
            .HasForeignKey(c => c.CustomerId)
            // Restrict, not Cascade: deleting a party must never take its trading history with
            // it. Parties are deactivated, never deleted.
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(c => c.CustomerId);
    }
}

internal sealed class ContractItemConfiguration : IEntityTypeConfiguration<ContractItem>
{
    public void Configure(EntityTypeBuilder<ContractItem> builder)
    {
        builder.ToTable("contract_items", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("contract_items", "incoterm"),
                ErpModelBuilderExtensions.EnumCheck<Incoterm>("incoterm"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("contract_items", "status"),
                ErpModelBuilderExtensions.EnumCheck<ContractStatus>("status"));
        });

        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasIdColumn();
        builder.Property(i => i.ContractId).HasIdColumn();
        builder.Property(i => i.Product).HasMaxLength(200).IsRequired();
        builder.Property(i => i.QuantityMt).HasQuantityColumn();
        builder.Property(i => i.RemainingMt).HasQuantityColumn();
        builder.Property(i => i.LmePercent).HasPercentColumn();
        builder.Property(i => i.FixedLmePrice).HasUnitPriceColumn();
        builder.Property(i => i.Premium).HasUnitPriceColumn();
        builder.Property(i => i.Incoterm).HasEnumColumn();
        builder.Property(i => i.Status).HasEnumColumn();
        builder.Property(i => i.Notes).HasMaxLength(2000);

        builder.HasOne(i => i.Contract).WithMany(c => c!.Items)
            .HasForeignKey(i => i.ContractId)
            // A line has no meaning without its contract, so it goes with it.
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(i => i.ContractId);
    }
}

internal sealed class ItemPartnerConfiguration : IEntityTypeConfiguration<ItemPartner>
{
    public void Configure(EntityTypeBuilder<ItemPartner> builder)
    {
        builder.ToTable("item_partners", t =>
            t.HasCheckConstraint("ck_item_partners_percent", "percent > 0 AND percent <= 100"));

        builder.HasKey(p => new { p.ContractItemId, p.PartnerId });
        builder.Property(p => p.ContractItemId).HasIdColumn();
        builder.Property(p => p.PartnerId).HasIdColumn();
        builder.Property(p => p.Percent).HasPercentColumn();

        builder.HasOne(p => p.ContractItem).WithMany(i => i!.Partners)
            .HasForeignKey(p => p.ContractItemId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(p => p.Partner).WithMany()
            .HasForeignKey(p => p.PartnerId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ContractItemChangeConfiguration : IEntityTypeConfiguration<ContractItemChange>
{
    public void Configure(EntityTypeBuilder<ContractItemChange> builder)
    {
        builder.ToTable("contract_item_changes", t =>
            t.HasCheckConstraint("ck_contract_item_changes_delta", "delta_mt <> 0"));

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.ContractItemId).HasIdColumn();
        builder.Property(c => c.UserName).HasMaxLength(200);
        builder.Property(c => c.DeltaMt).HasQuantityColumn();
        builder.Property(c => c.BeforeMt).HasQuantityColumn();
        builder.Property(c => c.AfterMt).HasQuantityColumn();
        builder.Property(c => c.Note).HasMaxLength(300);

        builder.HasOne(c => c.ContractItem).WithMany(i => i!.Changes)
            .HasForeignKey(c => c.ContractItemId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(c => c.ContractItemId);
    }
}

internal sealed class ContainerConfiguration : IEntityTypeConfiguration<Container>
{
    public void Configure(EntityTypeBuilder<Container> builder)
    {
        builder.ToTable("containers");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.Reference).HasMaxLength(64).IsRequired();
        // Kilograms as the weighbridge and the B/L record them, not tonnes.
        builder.Property(c => c.GrossWeightKg).HasQuantityColumn();
        builder.Property(c => c.NetWeightKg).HasQuantityColumn();
        builder.Property(c => c.BlNumber).HasMaxLength(64);
        builder.Property(c => c.BookingNumber).HasMaxLength(64);
        builder.Property(c => c.SealNumber).HasMaxLength(64);

        builder.HasIndex(c => c.Reference);
    }
}

internal sealed class ContainerGoodConfiguration : IEntityTypeConfiguration<ContainerGood>
{
    public void Configure(EntityTypeBuilder<ContainerGood> builder)
    {
        builder.ToTable("container_goods");
        builder.HasKey(g => new { g.ContainerId, g.ContractItemId });
        builder.Property(g => g.ContainerId).HasIdColumn();
        builder.Property(g => g.ContractItemId).HasIdColumn();
        builder.Property(g => g.QuantityMt).HasQuantityColumn();

        builder.HasOne(g => g.Container).WithMany(c => c!.Goods)
            .HasForeignKey(g => g.ContainerId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(g => g.ContractItem).WithMany()
            .HasForeignKey(g => g.ContractItemId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("invoices", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("invoices", "invoice_type"),
                ErpModelBuilderExtensions.EnumCheck<InvoiceType>("invoice_type"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("invoices", "status"),
                ErpModelBuilderExtensions.EnumCheck<InvoiceStatus>("status"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("invoices", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency"));
        });

        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasIdColumn();
        builder.Property(i => i.InvoiceNumber).HasMaxLength(64).IsRequired();
        builder.Property(i => i.InvoiceType).HasEnumColumn();
        builder.Property(i => i.Status).HasEnumColumn();
        builder.Property(i => i.Currency).HasEnumColumn();
        builder.Property(i => i.ContractId).HasIdColumn();
        builder.Property(i => i.CustomerId).HasIdColumn();
        builder.Property(i => i.RefInvoiceId).HasOptionalIdColumn();
        builder.Property(i => i.ExchangeRate).HasRateColumn();
        builder.Property(i => i.Description).HasMaxLength(2000);

        builder.HasOne(i => i.Contract).WithMany()
            .HasForeignKey(i => i.ContractId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(i => i.Customer).WithMany()
            .HasForeignKey(i => i.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(i => i.RefInvoice).WithMany()
            .HasForeignKey(i => i.RefInvoiceId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(i => i.InvoiceNumber).IsUnique();
        builder.HasIndex(i => i.ContractId);
        builder.HasIndex(i => i.CustomerId);

        // A document may be converted ONCE. Without this, two concurrent conversions both
        // succeed and the chain forks — every downstream cost and payment then counts twice.
        // Cancelled successors are excluded, because cancelling one must free the predecessor
        // to be converted again.
        builder.HasIndex(i => i.RefInvoiceId)
            .IsUnique()
            .HasFilter("ref_invoice_id IS NOT NULL AND status <> 'CANCELLED'")
            .HasDatabaseName("ux_invoices_live_successor");
    }
}

internal sealed class InvoiceItemConfiguration : IEntityTypeConfiguration<InvoiceItem>
{
    public void Configure(EntityTypeBuilder<InvoiceItem> builder)
    {
        builder.ToTable("invoice_items", t =>
            t.HasCheckConstraint(
                "ck_invoice_items_discount_percent",
                "discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)"));

        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasIdColumn();
        builder.Property(i => i.InvoiceId).HasIdColumn();
        builder.Property(i => i.ContractItemId).HasIdColumn();
        builder.Property(i => i.ReferenceDocumentItemId).HasIdColumn();
        builder.Property(i => i.ContainerId).HasOptionalIdColumn();
        builder.Property(i => i.Product).HasMaxLength(200).IsRequired();
        builder.Property(i => i.QuantityMt).HasQuantityColumn();
        builder.Property(i => i.GrossMt).HasQuantityColumn();
        builder.Property(i => i.TareMt).HasQuantityColumn();
        builder.Property(i => i.LmePercent).HasPercentColumn();
        builder.Property(i => i.DiscountPercent).HasPercentColumn();
        builder.Property(i => i.FixedPrice).HasUnitPriceColumn();
        builder.Property(i => i.Premium).HasUnitPriceColumn();
        builder.Property(i => i.LmePrice).HasUnitPriceColumn();
        builder.Property(i => i.Description).HasMaxLength(2000);

        builder.HasOne(i => i.Invoice).WithMany(x => x!.Items)
            .HasForeignKey(i => i.InvoiceId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(i => i.ContractItem).WithMany()
            .HasForeignKey(i => i.ContractItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(i => i.Container).WithMany()
            .HasForeignKey(i => i.ContainerId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(i => i.InvoiceId);
        // Warehouse movements, payment allocations, charge allocations and claims all look a
        // line up by this rather than by its id, so it carries an index of its own.
        builder.HasIndex(i => i.ReferenceDocumentItemId);
    }
}

internal sealed class InventoryDocumentConfiguration : IEntityTypeConfiguration<InventoryDocument>
{
    public void Configure(EntityTypeBuilder<InventoryDocument> builder)
    {
        builder.ToTable("inventory_documents", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("inventory_documents", "type"),
                ErpModelBuilderExtensions.EnumCheck<InventoryDocType>("type"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("inventory_documents", "status"),
                ErpModelBuilderExtensions.EnumCheck<DocumentStatus>("status"));
        });

        builder.HasKey(d => d.Id);
        builder.Property(d => d.Id).HasIdColumn();
        builder.Property(d => d.DocNumber).HasMaxLength(64).IsRequired();
        builder.Property(d => d.WarehouseId).HasIdColumn();
        builder.Property(d => d.InvoiceId).HasOptionalIdColumn();
        builder.Property(d => d.Type).HasEnumColumn();
        builder.Property(d => d.Status).HasEnumColumn();
        builder.Property(d => d.Notes).HasMaxLength(2000);

        builder.HasOne(d => d.Warehouse).WithMany()
            .HasForeignKey(d => d.WarehouseId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(d => d.Invoice).WithMany()
            .HasForeignKey(d => d.InvoiceId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(d => d.DocNumber).IsUnique();
        builder.HasIndex(d => d.WarehouseId);
    }
}

internal sealed class InventoryDocumentItemConfiguration : IEntityTypeConfiguration<InventoryDocumentItem>
{
    public void Configure(EntityTypeBuilder<InventoryDocumentItem> builder)
    {
        builder.ToTable("inventory_document_items");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasIdColumn();
        builder.Property(i => i.DocumentId).HasIdColumn();
        builder.Property(i => i.InvoiceItemId).HasOptionalIdColumn();
        builder.Property(i => i.ReferenceDocumentItemId).HasIdColumn();
        builder.Property(i => i.Product).HasMaxLength(200).IsRequired();
        builder.Property(i => i.QuantityMt).HasQuantityColumn();
        builder.Property(i => i.UnitCostUsd).HasUnitPriceColumn();
        // CostUsd is money: the (18, 2) convention default applies.

        builder.HasOne(i => i.Document).WithMany(d => d!.Items)
            .HasForeignKey(i => i.DocumentId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(i => i.DocumentId);
        builder.HasIndex(i => i.ReferenceDocumentItemId);
    }
}
