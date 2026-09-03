using System.Text.RegularExpressions;
using Finora.BuildingBlocks.Domain;
using Finora.Erp.Domain;

namespace Finora.UnitTests;

/// <summary>
/// Every ERP enum against the TypeScript union it mirrors, parsed from the front end's own
/// source.
///
/// <para>
/// This is the test that makes "the database matches the front-end model exactly" a fact rather
/// than an intention. A member added on one side and forgotten on the other fails here — not in
/// production, where the symptom would be a CHECK constraint rejecting a row the SPA thought
/// was valid, or a value the SPA cannot render.
/// </para>
/// </summary>
public sealed partial class EnumParityTests
{
    private static readonly string TypesSource = ReadTypesFile();

    public static TheoryData<string, string[]> Enums() => new()
    {
        { "Currency", EnumNames.Of<Currency>().ToArray() },
        { "PaymentMethod", EnumNames.Of<PaymentMethod>().ToArray() },
        { "Incoterm", EnumNames.Of<Incoterm>().ToArray() },
        { "MetalType", EnumNames.Of<MetalType>().ToArray() },
        { "GoodForm", EnumNames.Of<GoodForm>().ToArray() },
        { "GoodUnit", EnumNames.Of<GoodUnit>().ToArray() },
        { "ContractStatus", EnumNames.Of<ContractStatus>().ToArray() },
        { "CustomerType", EnumNames.Of<CustomerType>().ToArray() },
        { "ContractType", EnumNames.Of<ContractType>().ToArray() },
        { "PaymentType", EnumNames.Of<PaymentType>().ToArray() },
        { "PaymentStatus", EnumNames.Of<PaymentStatus>().ToArray() },
        { "TransferStatus", EnumNames.Of<TransferStatus>().ToArray() },
        { "ExchangeGainLossType", EnumNames.Of<ExchangeGainLossType>().ToArray() },
        { "ChequeType", EnumNames.Of<ChequeType>().ToArray() },
        { "ChequeStatus", EnumNames.Of<ChequeStatus>().ToArray() },
        { "InvoiceType", EnumNames.Of<InvoiceType>().ToArray() },
        { "InvoiceStatus", EnumNames.Of<InvoiceStatus>().ToArray() },
        { "ConversionStatus", EnumNames.Of<ConversionStatus>().ToArray() },
        { "InvoiceSide", EnumNames.Of<InvoiceSide>().ToArray() },
        { "InventoryDocType", EnumNames.Of<InventoryDocType>().ToArray() },
        { "FinancialAccountType", EnumNames.Of<FinancialAccountType>().ToArray() },
        { "ChargeDirection", EnumNames.Of<ChargeDirection>().ToArray() },
        { "ChargeScope", EnumNames.Of<ChargeScope>().ToArray() },
        { "ClaimSide", EnumNames.Of<ClaimSide>().ToArray() },
        { "ClaimType", EnumNames.Of<ClaimType>().ToArray() },
    };

    [Theory]
    [MemberData(nameof(Enums))]
    public void The_C_sharp_enum_matches_its_TypeScript_union(string unionName, string[] csharpValues)
    {
        var typescriptValues = ParseUnion(unionName);

        Assert.True(typescriptValues.Count > 0,
            $"No TypeScript union named '{unionName}' was found — has it been renamed?");

        // Ordered comparison: the sets must match, and so must the order, because the order is
        // what the CHECK constraint and the OpenAPI schema list.
        Assert.Equal(typescriptValues, csharpValues);
    }

    [Fact]
    public void The_two_values_containing_spaces_survive_the_round_trip()
    {
        // These two are why the wire spelling is data rather than the C# identifier. If either
        // ever loses its space, a CHECK constraint starts rejecting rows the SPA sends.
        Assert.Equal("ON HOLD", EnumNames.ToWire(ContractStatus.OnHold));
        Assert.Equal("Credit Note", EnumNames.ToWire(PaymentMethod.CreditNote));

        Assert.Equal(ContractStatus.OnHold, EnumNames.FromWire<ContractStatus>("ON HOLD"));
        Assert.Equal(PaymentMethod.CreditNote, EnumNames.FromWire<PaymentMethod>("Credit Note"));
    }

    [Fact]
    public void An_unknown_wire_value_is_rejected_rather_than_defaulted()
    {
        // Silently mapping an unrecognised string to the first member would turn a data problem
        // into a wrong answer — a payment method of "Barter" becoming "TT" moves real money in
        // a bank account balance.
        Assert.Throws<ArgumentOutOfRangeException>(() => EnumNames.FromWire<PaymentMethod>("Barter"));
    }

    /// <summary>
    /// Pulls the members out of <c>export type X = 'a' | 'b' | 'c';</c>, however it is wrapped
    /// across lines.
    /// </summary>
    private static List<string> ParseUnion(string name)
    {
        var declaration = Regex.Match(
            TypesSource,
            $@"export type {Regex.Escape(name)}\s*=\s*(?<body>[^;]+);",
            RegexOptions.Singleline,
            TimeSpan.FromSeconds(5));

        return declaration.Success
            ? [.. QuotedLiteral().Matches(declaration.Groups["body"].Value).Select(m => m.Groups[1].Value)]
            : [];
    }

    private static string ReadTypesFile()
    {
        var directory = new DirectoryInfo(Path.GetDirectoryName(typeof(EnumParityTests).Assembly.Location)!);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "apps")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return File.ReadAllText(Path.Combine(
            directory.FullName, "apps", "erp-panel", "src", "types", "index.ts"));
    }

    [GeneratedRegex(@"'([^']+)'")]
    private static partial Regex QuotedLiteral();
}
