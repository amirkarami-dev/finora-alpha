using System.Collections;

namespace Finora.BuildingBlocks.Domain;

/// <summary>
/// A business rule refusing an operation, identified by a stable machine code.
///
/// <para>
/// The code IS the contract with the front end. Components branch on it directly
/// (<c>e.message === 'duplicate-code'</c>) and several read extra fields off the error — the
/// quantity guard returns <c>available</c> and <c>remainingMt</c>, the payment total check
/// returns <c>headerUSD</c> and <c>linesUSD</c>, and so on. <see cref="Payload"/> carries those,
/// and the API's exception handler flattens them into the ProblemDetails extensions so the
/// existing checks keep working without touching a single component.
/// </para>
///
/// <para>Every code must exist in <c>backend/contracts/error-codes.json</c>.</para>
/// </summary>
public sealed class DomainException : Exception
{
    public DomainException(string code, IReadOnlyDictionary<string, object?>? payload = null)
        : base(code)
    {
        Code = code;
        Payload = payload ?? new Dictionary<string, object?>();
    }

    /// <summary>The machine-readable code, e.g. <c>qty-exceeds-remaining</c>.</summary>
    public string Code { get; }

    /// <summary>Extra context the UI renders inside the message for this code.</summary>
    public IReadOnlyDictionary<string, object?> Payload { get; }

    public override IDictionary Data
    {
        get
        {
            var data = base.Data;
            foreach (var (key, value) in Payload)
            {
                data[key] = value;
            }

            return data;
        }
    }
}

/// <summary>
/// A record the caller asked for does not exist. Separate from <see cref="DomainException"/>
/// because it maps to 404 rather than 422 — "you may not" and "there is no such thing" are
/// different answers, and the SPA routes them to different screens.
/// </summary>
public sealed class NotFoundException(string code) : Exception(code)
{
    public string Code { get; } = code;
}
