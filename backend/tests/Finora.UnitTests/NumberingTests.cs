using Finora.Erp.Domain;

namespace Finora.UnitTests;

/// <summary>
/// The three code rules the server assigns on behalf of the user. Pure functions over the codes
/// already stored, so a rule change is a one-line diff here and nowhere else.
/// </summary>
public sealed class NumberingTests
{
    [Fact]
    public void An_empty_list_starts_at_one() =>
        Assert.Equal("1", Numbering.NextIntegerCode([]));

    [Fact]
    public void The_next_integer_is_one_past_the_highest_not_the_count() =>
        Assert.Equal("8", Numbering.NextIntegerCode(["1", "7", "3"]));

    [Fact]
    public void Codes_that_are_not_integers_are_ignored() =>
        Assert.Equal("3", Numbering.NextIntegerCode(["AM", "2", "CU-CATH", ""]));

    [Fact]
    public void A_good_code_is_the_lowercase_metal_and_three_digits() =>
        Assert.Equal("copper-001", Numbering.NextGoodCode(MetalType.COPPER, []));

    [Fact]
    public void Good_codes_count_per_metal() =>
        Assert.Equal("copper-003",
            Numbering.NextGoodCode(MetalType.COPPER, ["copper-001", "copper-002", "aluminium-001", "zinc-009"]));

    [Fact]
    public void Good_codes_grow_past_three_digits_instead_of_failing() =>
        Assert.Equal("copper-1000", Numbering.NextGoodCode(MetalType.COPPER, ["copper-999"]));

    [Fact]
    public void A_document_number_is_yymm_and_four_digits()
    {
        var date = new DateTimeOffset(2026, 9, 2, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("26090001", Numbering.NextDocumentNumber(date, []));
    }

    [Fact]
    public void Document_numbers_share_one_sequence_within_a_month()
    {
        var date = new DateTimeOffset(2026, 9, 15, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("26090003", Numbering.NextDocumentNumber(date, ["26090001", "26090002", "26080007"]));
    }

    [Fact]
    public void A_new_month_restarts_at_one()
    {
        var october = new DateTimeOffset(2026, 10, 1, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("26100001", Numbering.NextDocumentNumber(october, ["26090001", "26090002"]));
    }

    [Fact]
    public void Past_9999_the_number_grows_to_five_digits()
    {
        var date = new DateTimeOffset(2026, 9, 30, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("260910000", Numbering.NextDocumentNumber(date, ["26099999"]));
    }

    [Fact]
    public void Old_style_numbers_do_not_disturb_the_sequence()
    {
        var date = new DateTimeOffset(2026, 9, 2, 8, 0, 0, TimeSpan.FromHours(4));
        Assert.Equal("26090001", Numbering.NextDocumentNumber(date, ["PO-2026-0001", "SI-2026-0002"]));
    }

    [Fact]
    public void The_month_is_taken_in_gulf_time_not_utc()
    {
        // 31 Aug 22:00 UTC is already 1 Sep 02:00 in the Gulf — the day the user picked.
        var lateAugustUtc = new DateTimeOffset(2026, 8, 31, 22, 0, 0, TimeSpan.Zero);
        Assert.Equal("26090001", Numbering.NextDocumentNumber(lateAugustUtc, []));
    }
}
