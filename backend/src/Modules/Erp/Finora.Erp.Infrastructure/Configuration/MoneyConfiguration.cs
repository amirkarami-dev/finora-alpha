using Finora.Erp.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Finora.Erp.Infrastructure.Configuration;

internal sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.ToTable("payments", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("payments", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("payments", "method"),
                ErpModelBuilderExtensions.EnumCheck<PaymentMethod>("method"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("payments", "direction"),
                ErpModelBuilderExtensions.EnumCheck<MoneyDirection>("direction"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("payments", "type"),
                ErpModelBuilderExtensions.EnumCheck<PaymentType>("type"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("payments", "status"),
                ErpModelBuilderExtensions.EnumCheck<PaymentStatus>("status"));
            // An FX rate of zero would make every USD figure derived from it infinite.
            t.HasCheckConstraint("ck_payments_fx_rate", "fx_rate > 0");
        });

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasIdColumn();
        builder.Property(p => p.CustomerId).HasIdColumn();
        builder.Property(p => p.InvoiceId).HasOptionalIdColumn();
        builder.Property(p => p.Currency).HasEnumColumn();
        builder.Property(p => p.Method).HasEnumColumn();
        builder.Property(p => p.Direction).HasEnumColumn();
        // Through the PROPERTY, not the backing field. `Type` derives itself from `InvoiceId`
        // when nobody set it, and EF's default field access reads the null backing field straight
        // past that getter — writing the enum's zero value, INVOICE, and inverting the rule for
        // every payment that arrives without a type.
        builder.Property(p => p.Type).HasEnumColumn().UsePropertyAccessMode(PropertyAccessMode.Property);
        builder.Property(p => p.Status).HasEnumColumn();
        builder.Property(p => p.FxRate).HasRateColumn();
        builder.Property(p => p.Reference).HasMaxLength(200);
        builder.Property(p => p.Notes).HasMaxLength(2000);

        builder.HasOne(p => p.Customer).WithMany()
            .HasForeignKey(p => p.CustomerId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(p => p.CustomerId);
        builder.HasIndex(p => p.Status);
    }
}

internal sealed class PaymentItemConfiguration : IEntityTypeConfiguration<PaymentItem>
{
    public void Configure(EntityTypeBuilder<PaymentItem> builder)
    {
        builder.ToTable("payment_items", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("payment_items", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("payment_items", "method"),
                ErpModelBuilderExtensions.EnumCheck<PaymentMethod>("method"));
            t.HasCheckConstraint("ck_payment_items_fx_rate", "fx_rate > 0");
            // A bank transfer names a bank and a cash payment names a safe; a cheque line names
            // a cheque. Pointing one at the other makes the two impossible to tell apart in any
            // account balance, which is a silent wrong answer rather than an error.
            t.HasCheckConstraint(
                "ck_payment_items_method_target",
                "(method IN ('TT', 'Cash') AND bank_account_id IS NOT NULL) OR " +
                "(method = 'Cheque' AND cheque_id IS NOT NULL) OR " +
                "method IN ('Offset', 'Credit Note')");
        });

        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasIdColumn();
        builder.Property(i => i.PaymentId).HasIdColumn();
        builder.Property(i => i.InvoiceId).HasOptionalIdColumn();
        builder.Property(i => i.BankAccountId).HasOptionalIdColumn();
        builder.Property(i => i.ChequeId).HasOptionalIdColumn();
        builder.Property(i => i.Currency).HasEnumColumn();
        builder.Property(i => i.Method).HasEnumColumn();
        builder.Property(i => i.FxRate).HasRateColumn();

        builder.HasOne(i => i.Payment).WithMany(p => p!.Items)
            .HasForeignKey(i => i.PaymentId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(i => i.Invoice).WithMany()
            .HasForeignKey(i => i.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(i => i.BankAccount).WithMany()
            .HasForeignKey(i => i.BankAccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(i => i.Cheque).WithMany()
            .HasForeignKey(i => i.ChequeId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(i => i.PaymentId);
        builder.HasIndex(i => i.InvoiceId);
        builder.HasIndex(i => i.ChequeId);
    }
}

internal sealed class PaymentItemAllocationConfiguration : IEntityTypeConfiguration<PaymentItemAllocation>
{
    public void Configure(EntityTypeBuilder<PaymentItemAllocation> builder)
    {
        builder.ToTable("payment_item_allocations");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasIdColumn();
        builder.Property(a => a.PaymentItemId).HasIdColumn();
        builder.Property(a => a.InvoiceItemId).HasIdColumn();
        builder.Property(a => a.ReferenceDocumentItemId).HasIdColumn();
        builder.Property(a => a.Product).HasMaxLength(200).IsRequired();

        builder.HasOne(a => a.PaymentItem).WithMany(i => i!.Allocations)
            .HasForeignKey(a => a.PaymentItemId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(a => a.PaymentItemId);
        // "How much of this invoice line is still owed" scans allocations across ALL payments,
        // so this is the index that read carries.
        builder.HasIndex(a => a.ReferenceDocumentItemId);
    }
}

internal sealed class ChequeConfiguration : IEntityTypeConfiguration<Cheque>
{
    public void Configure(EntityTypeBuilder<Cheque> builder)
    {
        builder.ToTable("cheques", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("cheques", "type"),
                ErpModelBuilderExtensions.EnumCheck<ChequeType>("type"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("cheques", "status"),
                ErpModelBuilderExtensions.EnumCheck<ChequeStatus>("status"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("cheques", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency"));
            // PAID is the moment the money lands, so it must say where. Leaving PAID clears it,
            // or an uncleared cheque would keep reporting a bank it never reached.
            t.HasCheckConstraint(
                "ck_cheques_paid_has_account",
                "(status = 'PAID' AND bank_account_id IS NOT NULL) OR " +
                "(status <> 'PAID' AND bank_account_id IS NULL)");
        });

        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasIdColumn();
        builder.Property(c => c.Number).HasMaxLength(64).IsRequired();
        builder.Property(c => c.BankName).HasMaxLength(200).IsRequired();
        builder.Property(c => c.OwnerName).HasMaxLength(200).IsRequired();
        builder.Property(c => c.BankAccountId).HasOptionalIdColumn();
        builder.Property(c => c.Type).HasEnumColumn();
        builder.Property(c => c.Status).HasEnumColumn();
        builder.Property(c => c.Currency).HasEnumColumn();
        builder.Property(c => c.Notes).HasMaxLength(2000);

        builder.HasOne(c => c.BankAccount).WithMany()
            .HasForeignKey(c => c.BankAccountId).OnDelete(DeleteBehavior.Restrict);

        // Unique per issuing bank, not globally: two banks may legitimately issue the same
        // number. A RETURNED cheque's number is freed, because a bounced cheque is usually
        // replaced by a new one carrying the same number.
        builder.HasIndex(c => new { c.BankName, c.Number })
            .IsUnique()
            .HasFilter("status <> 'RETURNED'")
            .HasDatabaseName("ux_cheques_number_per_bank");
    }
}

internal sealed class MoneyTransferConfiguration : IEntityTypeConfiguration<MoneyTransfer>
{
    public void Configure(EntityTypeBuilder<MoneyTransfer> builder)
    {
        builder.ToTable("money_transfers", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("money_transfers", "status"),
                ErpModelBuilderExtensions.EnumCheck<TransferStatus>("status"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("money_transfers", "from_currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("from_currency"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("money_transfers", "to_currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("to_currency"));
            t.HasCheckConstraint("ck_money_transfers_exchange_rate", "exchange_rate > 0");
            // Moving money to the account it came from is not a transfer.
            t.HasCheckConstraint("ck_money_transfers_distinct_accounts", "from_account_id <> to_account_id");
            // Same currency can only ever be 1:1 — any other rate creates or destroys money.
            t.HasCheckConstraint(
                "ck_money_transfers_same_currency_rate",
                "from_currency <> to_currency OR exchange_rate = 1");
        });

        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).HasIdColumn();
        builder.Property(t => t.Number).HasMaxLength(64).IsRequired();
        builder.Property(t => t.FromAccountId).HasIdColumn();
        builder.Property(t => t.ToAccountId).HasIdColumn();
        builder.Property(t => t.FromCurrency).HasEnumColumn();
        builder.Property(t => t.ToCurrency).HasEnumColumn();
        builder.Property(t => t.Status).HasEnumColumn();
        builder.Property(t => t.ExchangeRate).HasRateColumn();
        builder.Property(t => t.Notes).HasMaxLength(2000);

        builder.HasOne(t => t.FromAccount).WithMany()
            .HasForeignKey(t => t.FromAccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(t => t.ToAccount).WithMany()
            .HasForeignKey(t => t.ToAccountId).OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(t => t.Number).IsUnique();
    }
}

internal sealed class MoneyTransferAllocationConfiguration : IEntityTypeConfiguration<MoneyTransferAllocation>
{
    public void Configure(EntityTypeBuilder<MoneyTransferAllocation> builder)
    {
        builder.ToTable("money_transfer_allocations", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("money_transfer_allocations", "currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("currency"));
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("money_transfer_allocations", "base_currency"),
                ErpModelBuilderExtensions.EnumCheck<Currency>("base_currency"));
        });

        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasIdColumn();
        builder.Property(a => a.TransferId).HasIdColumn();
        builder.Property(a => a.InvoiceId).HasOptionalIdColumn();
        builder.Property(a => a.InvoiceItemId).HasOptionalIdColumn();
        builder.Property(a => a.Currency).HasEnumColumn();
        builder.Property(a => a.BaseCurrency).HasEnumColumn();

        builder.HasOne(a => a.Transfer).WithMany(t => t!.Allocations)
            .HasForeignKey(a => a.TransferId).OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(a => a.TransferId);
    }
}

internal sealed class ExchangeGainLossConfiguration : IEntityTypeConfiguration<ExchangeGainLoss>
{
    public void Configure(EntityTypeBuilder<ExchangeGainLoss> builder)
    {
        builder.ToTable("exchange_gain_losses", t =>
        {
            t.HasCheckConstraint(
                ErpModelBuilderExtensions.CheckName("exchange_gain_losses", "type"),
                ErpModelBuilderExtensions.EnumCheck<ExchangeGainLossType>("type"));
            // The type follows the sign; storing them independently lets them disagree, and a
            // "GAIN" of −5,000 is a number nobody can reconcile.
            t.HasCheckConstraint(
                "ck_exchange_gain_losses_type_matches_sign",
                "(type = 'GAIN' AND amount >= 0) OR (type = 'LOSS' AND amount <= 0)");
        });

        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).HasIdColumn();
        builder.Property(e => e.Number).HasMaxLength(64).IsRequired();
        builder.Property(e => e.Type).HasEnumColumn();
        builder.Property(e => e.Notes).HasMaxLength(2000);

        builder.HasIndex(e => e.Number).IsUnique();
    }
}
