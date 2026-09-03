using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Finora.Erp.Infrastructure.Configuration;

internal sealed class ConversionDocumentConfiguration : IEntityTypeConfiguration<ConversionDocument>
{
    public void Configure(EntityTypeBuilder<ConversionDocument> builder)
    {
        builder.ToTable("conversion_documents", t =>
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("conversion_documents", "status"),
                ErpModelBuilderExtensions.EnumCheck<ConversionStatus>("status")));

        builder.HasKey(d => d.Id);
        builder.Property(d => d.Id).HasIdColumn();
        builder.Property(d => d.DocNumber).HasMaxLength(64).IsRequired();
        builder.Property(d => d.WarehouseId).HasIdColumn();
        builder.Property(d => d.ChargeDocId).HasOptionalIdColumn();
        builder.Property(d => d.Status).HasEnumColumn();
        builder.Property(d => d.Notes).HasMaxLength(2000);
        // TotalInputCostUsd and TotalAddedCostUsd are money: the (18, 2) convention already
        // applies to every unconfigured decimal (see ErpDbContext.ConfigureConventions).

        builder.HasOne(d => d.Warehouse).WithMany()
            .HasForeignKey(d => d.WarehouseId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(d => d.DocNumber).IsUnique();
        builder.HasIndex(d => d.WarehouseId);
    }
}

internal sealed class ConversionInputConfiguration : IEntityTypeConfiguration<ConversionInput>
{
    public void Configure(EntityTypeBuilder<ConversionInput> builder)
    {
        builder.ToTable("conversion_inputs");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasIdColumn();
        builder.Property(i => i.DocumentId).HasIdColumn();
        builder.Property(i => i.Product).HasMaxLength(200).IsRequired();
        builder.Property(i => i.QuantityMt).HasQuantityColumn();
        builder.Property(i => i.UnitCostUsd).HasUnitPriceColumn();
        // CostUsd is money: the (18, 2) convention default applies.
        builder.HasOne(i => i.Document).WithMany(d => d!.Inputs)
            .HasForeignKey(i => i.DocumentId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(i => i.DocumentId);
    }
}

internal sealed class ConversionOutputConfiguration : IEntityTypeConfiguration<ConversionOutput>
{
    public void Configure(EntityTypeBuilder<ConversionOutput> builder)
    {
        builder.ToTable("conversion_outputs");
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Id).HasIdColumn();
        builder.Property(o => o.DocumentId).HasIdColumn();
        builder.Property(o => o.Product).HasMaxLength(200).IsRequired();
        builder.Property(o => o.QuantityMt).HasQuantityColumn();
        builder.Property(o => o.SharePercent).HasPercentColumn();
        builder.Property(o => o.UnitCostUsd).HasUnitPriceColumn();
        // CostUsd is money: the (18, 2) convention default applies.
        builder.HasOne(o => o.Document).WithMany(d => d!.Outputs)
            .HasForeignKey(o => o.DocumentId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(o => o.DocumentId);
    }
}

internal sealed class ConversionCostConfiguration : IEntityTypeConfiguration<ConversionCost>
{
    public void Configure(EntityTypeBuilder<ConversionCost> builder)
    {
        builder.ToTable("conversion_costs", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("conversion_costs", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency"));
            // An FX rate of zero or negative would silently corrupt AmountUsd, which is derived
            // from Amount / FxRate — same rule as every other FxRate-bearing table.
            t.HasCheckConstraint("ck_conversion_costs_fx_rate", "fx_rate > 0");
        });
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.DocumentId).HasIdColumn();
        builder.Property(c => c.CategoryId).HasIdColumn();
        builder.Property(c => c.PersonId).HasIdColumn();
        // Amount and AmountUsd are money: the (18, 2) convention default applies.
        builder.Property(c => c.Currency).HasEnumColumn();
        builder.Property(c => c.FxRate).HasRateColumn();
        builder.Property(c => c.Description).HasMaxLength(2000);
        builder.HasOne(c => c.Document).WithMany(d => d!.Costs)
            .HasForeignKey(c => c.DocumentId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(c => c.Category).WithMany()
            .HasForeignKey(c => c.CategoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(c => c.Person).WithMany()
            .HasForeignKey(c => c.PersonId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(c => c.DocumentId);
    }
}
