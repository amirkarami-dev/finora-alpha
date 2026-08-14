using System.Reflection;
using System.Text.RegularExpressions;

namespace Finora.ArchitectureTests;

/// <summary>
/// Conventions that are about the source text rather than the type graph, so NetArchTest cannot
/// see them.
/// </summary>
public sealed partial class SourceConventionTests
{
    private static readonly string BackendRoot = ResolveBackendRoot();

    /// <summary>
    /// The single most expensive thing that could silently go wrong in this port.
    ///
    /// <para>
    /// C#'s <c>Math.Round</c> rounds midpoints to even by default; the front end's
    /// <c>Math.round(x * 100) / 100</c> rounds half away from zero. One call site using the
    /// framework default is one cent of divergence on some invoice, discovered months later as
    /// a balance that will not reconcile. Every rounding goes through
    /// <c>BuildingBlocks.Domain.Rounding</c>, which is the only file allowed to call it.
    /// </para>
    /// </summary>
    [Fact]
    public void Only_the_Rounding_helper_calls_Math_Round()
    {
        var offenders = SourceFiles()
            .Where(f => Path.GetFileName(f) != "Rounding.cs")
            .Where(f => MathRound().IsMatch(File.ReadAllText(f)))
            .Select(f => Path.GetRelativePath(BackendRoot, f))
            .ToList();

        Assert.True(
            offenders.Count == 0,
            "Math.Round is called outside Rounding.cs:\n  " + string.Join("\n  ", offenders) +
            "\nUse Rounding.Money / Quantity / Rate — see the class summary for why.");
    }

    /// <summary>
    /// Money is <c>decimal</c>, never binary floating point. <c>0.1 + 0.2 != 0.3</c> in a double,
    /// and the cent-exact allocation split in <c>Rounding.SplitEqually</c> depends on exact
    /// arithmetic to guarantee its parts sum back to the whole.
    /// </summary>
    [Fact]
    public void No_float_or_double_in_the_domain()
    {
        var offenders = SourceFiles()
            .Where(f => f.Contains($"{Path.DirectorySeparatorChar}Domain{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     || f.Contains(".Domain", StringComparison.Ordinal))
            .Where(f => FloatingPoint().IsMatch(File.ReadAllText(f)))
            .Select(f => Path.GetRelativePath(BackendRoot, f))
            .ToList();

        Assert.True(
            offenders.Count == 0,
            "Binary floating point in a domain file:\n  " + string.Join("\n  ", offenders) +
            "\nMoney and quantities are decimal.");
    }

    private static IEnumerable<string> SourceFiles() =>
        Directory.EnumerateFiles(Path.Combine(BackendRoot, "src"), "*.cs", SearchOption.AllDirectories)
            // obj/ holds generated files (source generators, AssemblyInfo) that are not ours.
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal));

    private static string ResolveBackendRoot()
    {
        var injected = typeof(SourceConventionTests).Assembly
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .FirstOrDefault(a => a.Key == "BackendRoot")?.Value;

        Assert.False(string.IsNullOrWhiteSpace(injected),
            "BackendRoot was not injected by the csproj; the source rules would scan nothing.");

        var root = Path.GetFullPath(injected!);
        Assert.True(Directory.Exists(Path.Combine(root, "src")),
            $"Resolved backend root '{root}' has no src/ — the source rules would pass vacuously.");

        return root;
    }

    [GeneratedRegex(@"\bMath\.Round\b")]
    private static partial Regex MathRound();

    // Declarations only: `float x`, `double Total`, `(double)`. Deliberately not matching the
    // words inside comments or identifiers like `DoubleEntry`.
    [GeneratedRegex(@"(?<![\w.])(float|double)\s+\w+\s*[;={),]|\(\s*(float|double)\s*\)")]
    private static partial Regex FloatingPoint();
}
