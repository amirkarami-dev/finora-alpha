using System.Linq.Expressions;
using Finora.BuildingBlocks.Domain;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Finora.Erp.Infrastructure.Configuration;

/// <summary>
/// The shared column shapes, so 29 configuration files describe their entities rather than
/// repeating precision and enum plumbing.
/// </summary>
internal static class ErpModelBuilderExtensions
{
    /// <summary>
    /// Stores an enum as its wire name in <c>text</c>, with a CHECK constraint listing exactly
    /// the values <c>EnumNames</c> knows. One list drives the converter and the constraint, so a
    /// value the database accepts is always a value the JSON layer can produce.
    /// </summary>
    public static PropertyBuilder<TEnum> HasEnumColumn<TEnum>(this PropertyBuilder<TEnum> property)
        where TEnum : struct, Enum =>
        property
            .HasConversion(new ValueConverter<TEnum, string>(
                value => EnumNames.ToWire(value),
                wire => EnumNames.FromWire<TEnum>(wire)))
            .HasMaxLength(32)
            .IsRequired();

    /// <summary>The nullable counterpart.</summary>
    public static PropertyBuilder<TEnum?> HasEnumColumn<TEnum>(this PropertyBuilder<TEnum?> property)
        where TEnum : struct, Enum =>
        property
            .HasConversion(new ValueConverter<TEnum?, string?>(
                value => value == null ? null : EnumNames.ToWire(value.Value),
                wire => wire == null ? null : EnumNames.FromWire<TEnum>(wire)))
            .HasMaxLength(32);

    /// <summary>Quantity in metric tonnes — 6 decimals (one gram).
    /// <para>
    /// NOT 2. A line routinely carries more, and rounding a remaining quantity up at 2dp lets a
    /// warehouse movement over-consume its invoice line, or strands a fully-used line reporting
    /// a remainder. Six, not three, so that half a kilo is 0.0005 MT and not 0.001 or nothing.
    /// Must agree with <c>Rounding.Quantity</c>.
    /// </para></summary>
    public static PropertyBuilder<decimal> HasQuantityColumn(this PropertyBuilder<decimal> property) =>
        property.HasPrecision(18, 6);

    /// <inheritdoc cref="HasQuantityColumn(PropertyBuilder{decimal})"/>
    public static PropertyBuilder<decimal?> HasQuantityColumn(this PropertyBuilder<decimal?> property) =>
        property.HasPrecision(18, 6);

    /// <summary>A price per tonne — 4 decimals, because an LME-derived unit price is not a
    /// rounded amount of money until it is multiplied out.</summary>
    public static PropertyBuilder<decimal> HasUnitPriceColumn(this PropertyBuilder<decimal> property) =>
        property.HasPrecision(18, 4);

    /// <inheritdoc cref="HasUnitPriceColumn(PropertyBuilder{decimal})"/>
    public static PropertyBuilder<decimal?> HasUnitPriceColumn(this PropertyBuilder<decimal?> property) =>
        property.HasPrecision(18, 4);

    /// <summary>An exchange rate — 6 decimals.
    /// <para>
    /// The displayed rate is 4dp, but a transfer stores the INVERSE of what the user typed
    /// (1 / 3.6725 = 0.272294…), and 4dp there would lose money on the round trip. IQD's 1310
    /// needs the integer room, which 18 digits gives.
    /// </para></summary>
    public static PropertyBuilder<decimal> HasRateColumn(this PropertyBuilder<decimal> property) =>
        property.HasPrecision(18, 6);

    /// <summary>A percentage, 0–100, to 4 decimals (an LME percent like 94.76 is common).</summary>
    public static PropertyBuilder<decimal> HasPercentColumn(this PropertyBuilder<decimal> property) =>
        property.HasPrecision(9, 4);

    /// <inheritdoc cref="HasPercentColumn(PropertyBuilder{decimal})"/>
    public static PropertyBuilder<decimal?> HasPercentColumn(this PropertyBuilder<decimal?> property) =>
        property.HasPrecision(9, 4);

    /// <summary>An entity id. Short, indexed, and never longer than the readable ids the front
    /// end mints.</summary>
    public static PropertyBuilder<string> HasIdColumn(this PropertyBuilder<string> property) =>
        property.HasMaxLength(64).IsRequired();

    /// <inheritdoc cref="HasIdColumn(PropertyBuilder{string})"/>
    public static PropertyBuilder<string?> HasOptionalIdColumn(this PropertyBuilder<string?> property) =>
        property.HasMaxLength(64);

    /// <summary>Builds the SQL fragment for an enum column's CHECK constraint.</summary>
    public static string EnumCheck<TEnum>(string column) where TEnum : struct, Enum =>
        $"{Quote(column)} IN ({string.Join(", ", EnumNames.Of<TEnum>().Select(v => $"'{v.Replace("'", "''", StringComparison.Ordinal)}'"))})";

    private static string Quote(string identifier) => $"\"{identifier}\"";

    /// <summary>Names a CHECK constraint predictably: <c>ck_&lt;table&gt;_&lt;column&gt;</c>.</summary>
    public static string CheckName(string table, string column) => $"ck_{table}_{column}";

    /// <summary>Reads a property's snake_case column name without hard-coding it, so the naming
    /// convention stays the single source of that spelling.</summary>
    public static string ColumnOf<TEntity, TProperty>(
        this EntityTypeBuilder<TEntity> builder,
        Expression<Func<TEntity, TProperty>> property)
        where TEntity : class
    {
        ArgumentNullException.ThrowIfNull(builder);
        var name = builder.Property(property).Metadata.Name;
        return ToSnakeCase(name);
    }

    private static string ToSnakeCase(string value)
    {
        var result = new System.Text.StringBuilder(value.Length + 8);
        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            if (char.IsUpper(c))
            {
                // `AmountUSD` -> `amount_usd`, not `amount_u_s_d`: only break before a capital
                // that starts a new word, which is one preceded by a lower-case letter or
                // followed by a lower-case letter.
                var startsWord = i > 0 &&
                    (char.IsLower(value[i - 1]) ||
                     (i + 1 < value.Length && char.IsLower(value[i + 1])));
                if (startsWord) result.Append('_');
                result.Append(char.ToLowerInvariant(c));
            }
            else
            {
                result.Append(c);
            }
        }

        return result.ToString();
    }
}
