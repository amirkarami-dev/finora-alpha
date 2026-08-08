using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>
/// Writes a dataset touching every table and reads it straight back.
///
/// <para>
/// This is the test the whole strangler rests on. The SPA hydrates its store from a snapshot and
/// keeps running its own derivation over it, so anything the round trip loses — a nested
/// allocation, a 3dp tonnage, an enum with a space — becomes a wrong balance on screen with no
/// error anywhere. Every assertion below is a thing that would fail silently.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class SnapshotRoundTripTests(ApiFixture fixture)
{
    private static readonly DateTimeOffset When = new(2026, 3, 15, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Everything_written_comes_back_unchanged()
    {
        using var scope = fixture.Services.CreateScope();
        var snapshots = scope.ServiceProvider.GetRequiredService<SnapshotService>();

        await snapshots.ReplaceAsync(Build());
        var read = await snapshots.ReadAsync();

        // Every root collection arrived.
        Assert.Single(read.Customers);
        Assert.Single(read.Partners);
        Assert.Single(read.Warehouses);
        Assert.Single(read.CostCentres);
        Assert.Single(read.Goods);
        Assert.Single(read.ChargeCategories);
        Assert.Equal(2, read.FinancialAccounts.Count);
        Assert.Single(read.Contracts);
        Assert.Single(read.Containers);
        Assert.Equal(2, read.Invoices.Count);
        Assert.Single(read.InventoryDocs);
        Assert.Single(read.Payments);
        Assert.Single(read.Cheques);
        Assert.Single(read.MoneyTransfers);
        Assert.Single(read.ChargeDocs);
        Assert.Single(read.Claims);
        Assert.Single(read.ExchangeGainLosses);
        Assert.Equal(3.6725m, read.FxRate);
    }

    [Fact]
    public async Task Nested_children_survive_three_levels_deep()
    {
        using var scope = fixture.Services.CreateScope();
        var snapshots = scope.ServiceProvider.GetRequiredService<SnapshotService>();

        await snapshots.ReplaceAsync(Build());
        var read = await snapshots.ReadAsync();

        // contract -> item -> partner
        var item = Assert.Single(Assert.Single(read.Contracts).Items);
        Assert.Equal("cust-am", Assert.Single(read.Contracts).CustomerId);
        Assert.Equal(40m, Assert.Single(item.Partners).Percent);

        // payment -> item -> allocation (the payment carries two lines; the TT one allocates)
        var line = Assert.Single(Assert.Single(read.Payments).Items, i => i.Method == PaymentMethod.TT);
        Assert.Equal("ref-item-1", Assert.Single(line.Allocations).ReferenceDocumentItemId);

        // charge doc -> line -> allocation
        var chargeLine = Assert.Single(Assert.Single(read.ChargeDocs).Lines);
        Assert.Equal(50m, Assert.Single(chargeLine.Allocations).Amount);
    }

    [Fact]
    public async Task Precision_is_not_quietly_rounded_away()
    {
        using var scope = fixture.Services.CreateScope();
        var snapshots = scope.ServiceProvider.GetRequiredService<SnapshotService>();

        await snapshots.ReplaceAsync(Build());
        var read = await snapshots.ReadAsync();

        var item = Assert.Single(Assert.Single(read.Contracts).Items);

        // 3dp tonnage. At 2dp this reads back 28.03, and a warehouse movement can then
        // over-consume the line by half a kilo.
        Assert.Equal(28.027m, item.QuantityMt);
        // 4dp percentage, straight from the workbook.
        Assert.Equal(94.7600m, item.LmePercent);
        // 6dp rate: the inverse of 3.6725, which a transfer stores.
        Assert.Equal(0.272294m, Assert.Single(read.MoneyTransfers).ExchangeRate);
    }

    [Fact]
    public async Task Enum_values_with_spaces_survive_the_database()
    {
        using var scope = fixture.Services.CreateScope();
        var snapshots = scope.ServiceProvider.GetRequiredService<SnapshotService>();

        await snapshots.ReplaceAsync(Build());
        var read = await snapshots.ReadAsync();

        Assert.Equal(ContractStatus.OnHold, Assert.Single(read.Contracts).Status);
        Assert.Equal(PaymentMethod.CreditNote, Assert.Single(read.Payments).Items.Last().Method);
    }

    [Fact]
    public async Task The_conversion_chain_is_written_in_dependency_order()
    {
        using var scope = fixture.Services.CreateScope();
        var snapshots = scope.ServiceProvider.GetRequiredService<SnapshotService>();

        // Deliberately hands the successor FIRST. Without the topological ordering in
        // ReplaceAsync, the foreign key to a not-yet-written predecessor rejects the insert.
        var snapshot = Build();
        var reversed = snapshot with { Invoices = [.. snapshot.Invoices.Reverse()] };

        await snapshots.ReplaceAsync(reversed);
        var read = await snapshots.ReadAsync();

        var successor = read.Invoices.Single(i => i.RefInvoiceId is not null);
        Assert.Equal("inv-pp-0001", successor.RefInvoiceId);
    }

    [Fact]
    public async Task Replacing_twice_leaves_one_copy_not_two()
    {
        using var scope = fixture.Services.CreateScope();
        var snapshots = scope.ServiceProvider.GetRequiredService<SnapshotService>();

        await snapshots.ReplaceAsync(Build());
        await snapshots.ReplaceAsync(Build());
        var read = await snapshots.ReadAsync();

        Assert.Single(read.Customers);
        Assert.Equal(2, read.Invoices.Count);
        Assert.Single(Assert.Single(read.Payments).Items, i => i.Method == PaymentMethod.TT);
    }

    [Fact]
    public async Task Replacing_with_nothing_empties_every_table()
    {
        using var scope = fixture.Services.CreateScope();
        var snapshots = scope.ServiceProvider.GetRequiredService<SnapshotService>();

        await snapshots.ReplaceAsync(Build());
        await snapshots.ReplaceAsync(new ErpSnapshot());
        var read = await snapshots.ReadAsync();

        // "Reset" is this, and it has to leave nothing behind — including the invoice chain,
        // which references itself and needs more than one delete pass.
        Assert.Empty(read.Customers);
        Assert.Empty(read.Invoices);
        Assert.Empty(read.Payments);
        Assert.Empty(read.ChargeDocs);
    }

    /// <summary>A dataset touching every table, including the shapes most likely to be lost.</summary>
    private static ErpSnapshot Build() => new()
    {
        Partners = [new Partner { Id = "ptr-0001", Name = "Kurd Metals", Code = "KM" }],

        Customers =
        [
            new Customer
            {
                Id = "cust-am", Name = "Alco Metal Trading", Code = "AM",
                DefaultCurrency = Currency.AED, CustomerType = CustomerType.BOTH,
                PaymentTermsDays = 7, CreditLimit = 2_750_000m, CreatedAt = When,
            },
        ],

        Warehouses = [new Warehouse { Id = "wh-mw", Name = "Main Warehouse", Code = "MW" }],
        CostCentres = [new CostCentre { Id = "cc-0001", Name = "Logistics", Code = "LOG" }],

        Goods =
        [
            new Good
            {
                Id = "good-0001", Name = "Copper Cathode", Code = "CUCATH",
                MetalType = MetalType.COPPER, Form = GoodForm.CATHODE, Unit = GoodUnit.MT,
            },
        ],

        ChargeCategories =
        [
            new ChargeCategory
            {
                Id = "ccat-0001", Name = "Ocean Freight", Code = "FRT",
                Direction = ChargeDirection.EXPENSE, Scope = ChargeScope.INVOICE,
            },
        ],

        FinancialAccounts =
        [
            new FinancialAccount
            {
                Id = "fa-0001", Name = "Mashreq — USD", Type = FinancialAccountType.BANK,
                Currency = Currency.USD, AccountNumber = "0123456789", Iban = "AE070331234567890123456",
            },
            new FinancialAccount
            {
                Id = "fa-0002", Name = "Office safe — AED",
                Type = FinancialAccountType.CASH_SAFE, Currency = Currency.AED,
            },
        ],

        Contracts =
        [
            new Contract
            {
                Id = "AM-P-251101156", CustomerId = "cust-am", ContractType = ContractType.PURCHASE,
                Date = When, Destination = "NINGBO",
                // The one enum value whose wire form contains a space.
                Status = ContractStatus.OnHold,
                Items =
                {
                    new ContractItem
                    {
                        Id = "item-0001", ContractId = "AM-P-251101156", Product = "Copper Cathode",
                        QuantityMt = 28.027m, RemainingMt = 28.027m, LmePercent = 94.76m,
                        LmeFixed = true, FixedLmePrice = 11_685m, Premium = 0m,
                        Incoterm = Incoterm.CNF, Status = ContractStatus.ACTIVE,
                        Partners = { new ItemPartner { ContractItemId = "item-0001", PartnerId = "ptr-0001", Percent = 40m } },
                    },
                },
            },
        ],

        Containers =
        [
            new Container
            {
                Id = "cnt-0001", Reference = "MSNU8018095", LoadDate = When,
                GrossWeightKg = 28_500m, NetWeightKg = 28_027m, BlNumber = "BL-1", SealNumber = "SL-1",
                Goods = { new ContainerGood { ContainerId = "cnt-0001", ContractItemId = "item-0001", QuantityMt = 28.027m } },
            },
        ],

        Invoices =
        [
            new Invoice
            {
                Id = "inv-pp-0001", InvoiceNumber = "PP-2026-0001",
                InvoiceType = InvoiceType.PURCHASE_PROVISIONAL, InvoiceDate = When,
                ContractId = "AM-P-251101156", CustomerId = "cust-am",
                Status = InvoiceStatus.CONFIRMED, Currency = Currency.USD, ExchangeRate = 1m,
                TotalAmount = 327_500m, TotalWeightMt = 28.027m, CreatedAt = When,
            },
            new Invoice
            {
                Id = "inv-pi-0001", InvoiceNumber = "PI-2026-0001",
                InvoiceType = InvoiceType.PURCHASE_INVOICE, InvoiceDate = When,
                ContractId = "AM-P-251101156", CustomerId = "cust-am",
                Status = InvoiceStatus.CONFIRMED, Currency = Currency.USD, ExchangeRate = 1m,
                RefInvoiceId = "inv-pp-0001",
                TotalAmount = 327_500m, TotalWeightMt = 28.027m, CreatedAt = When,
                Items =
                {
                    new InvoiceItem
                    {
                        Id = "invitem-0001", InvoiceId = "inv-pi-0001", ContractItemId = "item-0001",
                        ReferenceDocumentItemId = "ref-item-1", Product = "Copper Cathode",
                        QuantityMt = 28.027m, LmePercent = 94.76m, LmeFixed = true,
                        FixedPrice = 11_685m, Premium = 0m, Amount = 327_500m, ContainerId = "cnt-0001",
                    },
                },
            },
        ],

        InventoryDocs =
        [
            new InventoryDocument
            {
                Id = "invdoc-0001", DocNumber = "GRN-2026-0001", WarehouseId = "wh-mw",
                InvoiceId = "inv-pi-0001", Type = InventoryDocType.IN, Date = When,
                Status = DocumentStatus.CONFIRMED,
                Items =
                {
                    new InventoryDocumentItem
                    {
                        Id = "invdocitem-0001", DocumentId = "invdoc-0001",
                        InvoiceItemId = "invitem-0001", ReferenceDocumentItemId = "ref-item-1",
                        Product = "Copper Cathode", QuantityMt = 28.027m,
                    },
                },
            },
        ],

        Cheques =
        [
            new Cheque
            {
                Id = "chq-0001", Type = ChequeType.NORMAL, Number = "440119",
                BankName = "Emirates NBD", DueDate = When, Amount = 5_000m,
                Currency = Currency.AED, OwnerName = "Alco Metal Trading",
                Status = ChequeStatus.PENDING,
            },
        ],

        Payments =
        [
            new Payment
            {
                Id = "NIZ001", CustomerId = "cust-am", Date = When, Currency = Currency.USD,
                Amount = 100m, FxRate = 1m, AmountUSD = 100m, Method = PaymentMethod.TT,
                Direction = MoneyDirection.OUT, Type = PaymentType.INVOICE,
                Status = PaymentStatus.CONFIRMED,
                Items =
                {
                    new PaymentItem
                    {
                        Id = "payitem-1", PaymentId = "NIZ001", InvoiceId = "inv-pi-0001",
                        Date = When, Amount = 60m, Currency = Currency.USD, FxRate = 1m,
                        AmountUSD = 60m, Method = PaymentMethod.TT, BankAccountId = "fa-0001",
                        Allocations =
                        {
                            new PaymentItemAllocation
                            {
                                Id = "payalloc-1", PaymentItemId = "payitem-1",
                                InvoiceItemId = "invitem-0001", ReferenceDocumentItemId = "ref-item-1",
                                Product = "Copper Cathode", Amount = 60m, AmountUSD = 60m,
                            },
                        },
                    },
                    // The other value whose wire form contains a space, and a method that needs
                    // neither an account nor a cheque.
                    new PaymentItem
                    {
                        Id = "payitem-2", PaymentId = "NIZ001", InvoiceId = "inv-pi-0001",
                        Date = When, Amount = 40m, Currency = Currency.USD, FxRate = 1m,
                        AmountUSD = 40m, Method = PaymentMethod.CreditNote,
                    },
                },
            },
        ],

        MoneyTransfers =
        [
            new MoneyTransfer
            {
                Id = "tr-0001", Number = "TR-0001", Date = When,
                FromAccountId = "fa-0002", ToAccountId = "fa-0001",
                FromCurrency = Currency.AED, ToCurrency = Currency.USD,
                FromAmount = 3_672.50m, ToAmount = 1_000m,
                // 1 / 3.6725 — the value that proves 6dp rates, since 4dp would lose it.
                ExchangeRate = 0.272294m, BaseAmount = 1_000m, Status = TransferStatus.CONFIRMED,
                Allocations =
                {
                    new MoneyTransferAllocation
                    {
                        Id = "tralloc-1", TransferId = "tr-0001", InvoiceId = "inv-pi-0001",
                        Amount = 1_000m, Currency = Currency.AED, BaseAmount = 1_000m,
                        BaseCurrency = Currency.USD,
                    },
                },
            },
        ],

        ChargeDocs =
        [
            new ChargeDoc
            {
                Id = "chg-0001", Direction = ChargeDirection.EXPENSE, Kind = ChargeScope.INVOICE,
                Title = "Import costs", InvoiceId = "inv-pi-0001", Date = When,
                Status = RecordStatus.ACTIVE, CreatedAt = When, TotalUSD = 50m,
                Lines =
                {
                    new ChargeLine
                    {
                        Id = "chgline-1", DocId = "chg-0001", CategoryId = "ccat-0001",
                        Date = When, Amount = 50m, Currency = Currency.USD, FxRate = 1m,
                        AmountUSD = 50m, CostCentreId = "cc-0001", PersonId = "cust-am",
                        QuantityBasisMt = 28.027m,
                        Allocations =
                        {
                            new ChargeAllocation
                            {
                                Id = "chgalloc-1", LineId = "chgline-1",
                                InvoiceItemId = "invitem-0001", ReferenceDocumentItemId = "ref-item-1",
                                Product = "Copper Cathode", QuantityMt = 28.027m,
                                Amount = 50m, AmountUSD = 50m,
                            },
                        },
                    },
                },
            },
        ],

        Claims =
        [
            new Claim
            {
                Id = "clm-0001", Side = ClaimSide.PURCHASE, Title = "Short weight",
                InvoiceId = "inv-pi-0001", PartyId = "cust-am", ClaimType = ClaimType.QUANTITY,
                Date = When, Currency = Currency.USD, FxRate = 1m, Amount = 25m, AmountUSD = 25m,
                Status = RecordStatus.ACTIVE, CreatedAt = When,
                Items =
                {
                    new ClaimItem
                    {
                        Id = "clmitem-1", ClaimId = "clm-0001", InvoiceItemId = "invitem-0001",
                        ReferenceDocumentItemId = "ref-item-1", Product = "Copper Cathode",
                        QuantityMt = 28.027m, Amount = 25m, AmountUSD = 25m,
                    },
                },
            },
        ],

        ExchangeGainLosses =
        [
            new ExchangeGainLoss
            {
                Id = "egl-0001", Number = "EGL-0001", Date = When,
                Type = ExchangeGainLossType.GAIN, Amount = 9_400m, CreatedAt = When,
            },
        ],

        FxRate = 3.6725m,
    };
}
