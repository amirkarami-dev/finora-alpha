using Finora.BuildingBlocks.Domain;

namespace Finora.UnitTests;

/// <summary>
/// Pins <see cref="Rounding"/> to the front end's arithmetic. Every expectation here was taken
/// from what <c>apps/erp-panel/src/utils/calc.ts</c> and <c>api.ts</c> actually produce, not
/// from what C# happens to do.
/// </summary>
public sealed class RoundingTests
{
    [Theory]
    // The cases where banker's rounding and the front end disagree. C#'s default
    // Math.Round(2.345m, 2) gives 2.34 (round half to even); JavaScript gives 2.35.
    [InlineData(2.345, 2.35)]
    [InlineData(2.355, 2.36)]
    [InlineData(0.005, 0.01)]
    [InlineData(0.015, 0.02)]
    [InlineData(1.005, 1.01)]
    // Negatives round away from zero on both sides.
    [InlineData(-2.345, -2.35)]
    [InlineData(-0.005, -0.01)]
    // Ordinary cases.
    [InlineData(1234.5678, 1234.57)]
    [InlineData(0, 0)]
    [InlineData(100, 100)]
    public void Money_rounds_half_away_from_zero(decimal input, decimal expected) =>
        Assert.Equal(expected, Rounding.Money(input));

    [Fact]
    public void Money_differs_from_the_framework_default()
    {
        // Guards the reason this helper exists: if the two ever agree by accident, the test
        // above stops proving anything.
        Assert.Equal(2.34m, Math.Round(2.345m, 2));   // banker's — what we must NOT do
        Assert.Equal(2.35m, Rounding.Money(2.345m));  // the front end's answer
    }

    [Theory]
    [InlineData(28.0265, 28.027)]
    [InlineData(23.9725, 23.973)]
    [InlineData(0.0005, 0.001)]
    [InlineData(258.7615, 258.762)]
    public void Quantity_keeps_three_decimals(decimal input, decimal expected) =>
        Assert.Equal(expected, Rounding.Quantity(input));

    [Theory]
    [InlineData(3.67254, 3.6725)]      // the AED rate the desk quotes
    [InlineData(0.2722940776, 0.2723)] // its inverse, which the transfer form stores
    [InlineData(1310, 1310)]           // IQD needs the integer headroom, not the decimals
    public void Rate_keeps_four_decimals(decimal input, decimal expected) =>
        Assert.Equal(expected, Rounding.Rate(input));

    [Fact]
    public void Split_gives_the_leftover_cents_to_the_first_parts()
    {
        // The worked example from the expense/revenue design contract: $100 across 3 goods.
        Assert.Equal([33.34m, 33.33m, 33.33m], Rounding.SplitEqually(100m, 3));
    }

    [Theory]
    [InlineData(100, 3)]
    [InlineData(100, 7)]
    [InlineData(0.03, 4)]
    [InlineData(18400, 4)]
    [InlineData(12253.23, 5)]
    [InlineData(1, 3)]
    public void Split_parts_always_sum_back_to_the_whole(decimal amount, int parts)
    {
        var split = Rounding.SplitEqually(amount, parts);

        Assert.Equal(parts, split.Length);
        Assert.Equal(Rounding.Money(amount), split.Sum());
    }

    [Fact]
    public void Split_of_a_negative_amount_does_not_drop_cents()
    {
        // The TS version's comment records this exact bug: truncation rounds a negative
        // quotient toward zero, the remainder goes negative, and the leftover cents vanish —
        // -100 split three ways summed to -99.99.
        var split = Rounding.SplitEqually(-100m, 3);

        Assert.Equal(-100m, split.Sum());
    }

    [Fact]
    public void Split_of_no_parts_is_empty() =>
        Assert.Empty(Rounding.SplitEqually(100m, 0));
}
