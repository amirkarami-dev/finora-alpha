using System.Collections.Concurrent;

namespace Finora.Api.Assistant;

/// <summary>Sliding one-hour window per user, in memory. One API process per tenant, so a
/// distributed store would be machinery earning nothing today.</summary>
public sealed class AssistantRateLimiter(TimeProvider clock)
{
    private readonly ConcurrentDictionary<Guid, Queue<DateTimeOffset>> _calls = new();

    /// <summary>True when the call is allowed (and counted); false when the user is over the limit.</summary>
    public bool TryTake(Guid userId, int perHour)
    {
        var now = clock.GetUtcNow();
        var queue = _calls.GetOrAdd(userId, _ => new Queue<DateTimeOffset>());
        lock (queue)
        {
            while (queue.Count > 0 && now - queue.Peek() > TimeSpan.FromHours(1))
            {
                queue.Dequeue();
            }

            if (queue.Count >= perHour)
            {
                return false;
            }

            queue.Enqueue(now);
            return true;
        }
    }

    /// <summary>Forgets every window. Test support only.</summary>
    public void Reset() => _calls.Clear();
}
