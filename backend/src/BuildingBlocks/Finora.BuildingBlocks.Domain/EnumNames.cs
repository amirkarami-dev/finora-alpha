using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json.Serialization;

namespace Finora.BuildingBlocks.Domain;

/// <summary>
/// The one place an enum's wire spelling is decided.
///
/// <para>
/// Every enum in this domain is a TypeScript string union on the other side of the wire —
/// <c>'ON HOLD'</c>, <c>'Credit Note'</c>, <c>'PURCHASE_PROVISIONAL'</c> — and those exact
/// strings are what the SPA renders, filters on and stores. Members carry
/// <see cref="JsonStringEnumMemberNameAttribute"/> where the C# name cannot be the wire name,
/// and this class reads it.
/// </para>
///
/// <para>
/// It feeds <b>three</b> consumers from one list: the EF value converter, the generated
/// <c>CHECK</c> constraint text, and the OpenAPI schema. One source, three uses, no drift — the
/// alternative is three hand-maintained copies of the same strings, and the day they disagree
/// is the day a row is written that the front end cannot read.
/// </para>
/// </summary>
public static class EnumNames
{
    private static readonly ConcurrentDictionary<Type, string[]> Cache = new();

    /// <summary>Every member's wire name, in declaration order.</summary>
    public static IReadOnlyList<string> Of<TEnum>() where TEnum : struct, Enum =>
        Cache.GetOrAdd(typeof(TEnum), static type => type
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Select(WireName)
            .ToArray());

    /// <summary>The wire name of one value.</summary>
    public static string ToWire<TEnum>(TEnum value) where TEnum : struct, Enum
    {
        var field = typeof(TEnum).GetField(value.ToString(), BindingFlags.Public | BindingFlags.Static)
            ?? throw new ArgumentOutOfRangeException(nameof(value), value, $"Not a member of {typeof(TEnum).Name}.");

        return WireName(field);
    }

    /// <summary>Parses a wire name back to its member. Throws on anything unrecognised.</summary>
    public static TEnum FromWire<TEnum>(string wire) where TEnum : struct, Enum
    {
        foreach (var field in typeof(TEnum).GetFields(BindingFlags.Public | BindingFlags.Static))
        {
            if (string.Equals(WireName(field), wire, StringComparison.Ordinal))
            {
                return (TEnum)field.GetValue(null)!;
            }
        }

        throw new ArgumentOutOfRangeException(
            nameof(wire), wire, $"'{wire}' is not a value of {typeof(TEnum).Name}.");
    }

    private static string WireName(FieldInfo field) =>
        field.GetCustomAttribute<JsonStringEnumMemberNameAttribute>()?.Name ?? field.Name;
}
