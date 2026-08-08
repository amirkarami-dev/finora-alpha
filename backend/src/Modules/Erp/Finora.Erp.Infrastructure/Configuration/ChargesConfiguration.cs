using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Finora.Erp.Infrastructure.Configuration;

internal sealed class ChargeDocConfiguration : IEntityTypeConfiguration<ChargeDoc>
{
    public void Configure(EntityTypeBuilder<ChargeDoc> builder)
    {
        builder.ToTable("charge_docs", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("charge_docs", "direction"),
                ErpModelBuilderExtensions.EnumCheck<ChargeDirection>("direction"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("charge_docs", "kind"),
                ErpModelBuilderExtensions.EnumCheck<ChargeScope>("kind"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("charge_docs", "status"),
                ErpModelBuilderExtensions.EnumCheck<RecordStatus>("status"));
            // An INVOICE document is booked ON a document; a GENERAL one belongs to none.
            t.HasCheckConstraint(
                "ck_charge_docs_kind_invoice",
                "(kind = 'INVOICE' AND invoice_id IS NOT NULL) OR " +
                "(kind = 'GENERAL' AND invoice_id IS NULL)");
        });

        builder.HasKey(d => d.Id);
        builder.Property(d => d.Id).HasIdColumn();
        builder.Property(d => d.InvoiceId).HasOptionalIdColumn();
        builder.Property(d => d.Title).HasMaxLength(200).IsRequired();
        builder.Property(d => d.Direction).HasEnumColumn();
        builder.Property(d => d.Kind).HasEnumColumn();
        builder.Property(d => d.Status).HasEnumColumn();
        builder.Property(d => d.Description).HasMaxLength(2000);

        builder.HasOne(d => d.Invoice).WithMany()
            .HasForeignKey(d => d.InvoiceId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(d => d.InvoiceId);
        builder.HasIndex(d => d.Direction);
    }
}

internal sealed class ChargeLineConfiguration : IEntityTypeConfiguration<ChargeLine>
{
    public void Configure(EntityTypeBuilder<ChargeLine> builder)
    {
        builder.ToTable("charge_lines", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("charge_lines", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency"));
            t.HasCheckConstraint("ck_charge_lines_fx_rate", "fx_rate > 0");
        });

        builder.HasKey(l => l.Id);
        builder.Property(l => l.Id).HasIdColumn();
        builder.Property(l => l.DocId).HasIdColumn();
        builder.Property(l => l.CategoryId).HasIdColumn();
        builder.Property(l => l.CostCentreId).HasOptionalIdColumn();
        builder.Property(l => l.PersonId).HasOptionalIdColumn();
        builder.Property(l => l.Currency).HasEnumColumn();
        builder.Property(l => l.FxRate).HasRateColumn();
        builder.Property(l => l.QuantityBasisMt).HasQuantityColumn();
        builder.Property(l => l.UnitPriceUSD).HasUnitPriceColumn();
        builder.Property(l => l.Description).HasMaxLength(2000);

        builder.HasOne(l => l.Doc).WithMany(d => d!.Lines)
            .HasForeignKey(l => l.DocId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(l => l.Category).WithMany()
            .HasForeignKey(l => l.CategoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(l => l.CostCentre).WithMany()
            .HasForeignKey(l => l.CostCentreId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(l => l.Person).WithMany()
            .HasForeignKey(l => l.PersonId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(l => l.DocId);
        // The person ledger walks charge lines per person, and the expense report groups by
        // category — both are per-line reads across every document.
        builder.HasIndex(l => l.PersonId);
        builder.HasIndex(l => l.CategoryId);
    }
}

internal sealed class ChargeAllocationConfiguration : IEntityTypeConfiguration<ChargeAllocation>
{
    public void Configure(EntityTypeBuilder<ChargeAllocation> builder)
    {
        builder.ToTable("charge_allocations");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasIdColumn();
        builder.Property(a => a.LineId).HasIdColumn();
        builder.Property(a => a.InvoiceItemId).HasIdColumn();
        builder.Property(a => a.ReferenceDocumentItemId).HasIdColumn();
        builder.Property(a => a.Product).HasMaxLength(200).IsRequired();
        builder.Property(a => a.QuantityMt).HasQuantityColumn();

        builder.HasOne(a => a.Line).WithMany(l => l!.Allocations)
            .HasForeignKey(a => a.LineId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(a => a.LineId);
        builder.HasIndex(a => a.ReferenceDocumentItemId);
    }
}

internal sealed class ClaimConfiguration : IEntityTypeConfiguration<Claim>
{
    public void Configure(EntityTypeBuilder<Claim> builder)
    {
        builder.ToTable("claims", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("claims", "side"),
                ErpModelBuilderExtensions.EnumCheck<ClaimSide>("side"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("claims", "claim_type"),
                ErpModelBuilderExtensions.EnumCheck<ClaimType>("claim_type"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("claims", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("claims", "status"),
                ErpModelBuilderExtensions.EnumCheck<RecordStatus>("status"));
            t.HasCheckConstraint("ck_claims_fx_rate", "fx_rate > 0");
        });

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.InvoiceId).HasIdColumn();
        builder.Property(c => c.PartyId).HasIdColumn();
        builder.Property(c => c.Title).HasMaxLength(200).IsRequired();
        builder.Property(c => c.Side).HasEnumColumn();
        builder.Property(c => c.ClaimType).HasEnumColumn();
        builder.Property(c => c.Currency).HasEnumColumn();
        builder.Property(c => c.Status).HasEnumColumn();
        builder.Property(c => c.FxRate).HasRateColumn();
        builder.Property(c => c.Description).HasMaxLength(2000);

        builder.HasOne(c => c.Invoice).WithMany()
            .HasForeignKey(c => c.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(c => c.Party).WithMany()
            .HasForeignKey(c => c.PartyId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(c => c.InvoiceId);
        builder.HasIndex(c => c.PartyId);
    }
}

internal sealed class ClaimItemConfiguration : IEntityTypeConfiguration<ClaimItem>
{
    public void Configure(EntityTypeBuilder<ClaimItem> builder)
    {
        builder.ToTable("claim_items");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasIdColumn();
        builder.Property(i => i.ClaimId).HasIdColumn();
        builder.Property(i => i.InvoiceItemId).HasIdColumn();
        builder.Property(i => i.ReferenceDocumentItemId).HasIdColumn();
        builder.Property(i => i.Product).HasMaxLength(200).IsRequired();
        builder.Property(i => i.QuantityMt).HasQuantityColumn();
        builder.Property(i => i.Description).HasMaxLength(2000);

        builder.HasOne(i => i.Claim).WithMany(c => c!.Items)
            .HasForeignKey(i => i.ClaimId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(i => i.ClaimId);
        builder.HasIndex(i => i.ReferenceDocumentItemId);
    }
}
