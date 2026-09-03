using Finora.Erp.Domain;

namespace Finora.UnitTests;

/// <summary>How a conversion's total cost lands on its outputs — the only arithmetic in the feature.</summary>
public sealed class ConversionMathTests
{
    [Fact]
    public void Without_shares_the_cost_follows_the_weight()
    {
        var split = ConversionMath.Distribute(10000m, [0.650m, 0.350m], [null, null]);
        Assert.Equal(new[] { 6500m, 3500m }, split);
    }

    [Fact]
    public void With_shares_the_cost_follows_the_shares()
    {
        var split = ConversionMath.Distribute(10000m, [0.650m, 0.350m], [98m, 2m]);
        Assert.Equal(new[] { 9800m, 200m }, split);
    }

    [Fact]
    public void The_last_output_absorbs_the_rounding_so_the_parts_sum_to_the_total()
    {
        var split = ConversionMath.Distribute(100m, [1m, 1m, 1m], [null, null, null]);
        Assert.Equal(new[] { 33.33m, 33.33m, 33.34m }, split);
        Assert.Equal(100m, split.Sum());
    }

    [Fact]
    public void A_single_output_takes_everything()
    {
        Assert.Equal(new[] { 10800m }, ConversionMath.Distribute(10800m, [0.600m], [null]));
    }

    [Fact]
    public void Shares_must_all_be_given_or_all_be_absent_and_sum_to_a_hundred()
    {
        Assert.True(ConversionMath.SharesAreValid([null, null]));
        Assert.True(ConversionMath.SharesAreValid([60m, 40m]));
        Assert.True(ConversionMath.SharesAreValid([33.33m, 33.33m, 33.34m]));
        Assert.False(ConversionMath.SharesAreValid([60m, null]));
        Assert.False(ConversionMath.SharesAreValid([60m, 30m]));
        Assert.False(ConversionMath.SharesAreValid([-10m, 110m]));
    }

    [Theory]
    [InlineData(1.000, 0.650, 65.00)]
    [InlineData(0.650, 0.600, 92.31)]
    [InlineData(0, 0.5, 0)]
    public void Yield_is_output_over_input_in_percent(decimal input, decimal output, decimal expected) =>
        Assert.Equal(expected, ConversionMath.Yield(input, output));
}
