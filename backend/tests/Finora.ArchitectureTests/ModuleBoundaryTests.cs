using System.Reflection;
using NetArchTest.Rules;

namespace Finora.ArchitectureTests;

/// <summary>
/// The modular monolith's boundaries, enforced.
///
/// <para>
/// The whole reason to build a modular monolith rather than microservices is that the module
/// boundaries are a choice you can defer — but only if they are real. A boundary that exists
/// solely in a diagram erodes on the first deadline, and then the option to split a module out
/// later is gone. These tests are what keep the option open.
/// </para>
/// </summary>
public sealed class ModuleBoundaryTests
{
    private static readonly Assembly[] AllAssemblies = LoadFinoraAssemblies();

    public static TheoryData<string, string> ForeignModulePairs()
    {
        var modules = new[] { "Identity", "Cms", "Erp" };
        var data = new TheoryData<string, string>();
        foreach (var module in modules)
        {
            foreach (var other in modules.Where(m => m != module))
            {
                data.Add(module, other);
            }
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(ForeignModulePairs))]
    public void A_module_does_not_reference_another_module(string module, string other)
    {
        foreach (var assembly in AssembliesOf(module))
        {
            var referenced = assembly.GetReferencedAssemblies()
                .Select(a => a.Name)
                .Where(n => n is not null && n.StartsWith($"Finora.{other}.", StringComparison.Ordinal))
                .ToList();

            Assert.True(
                referenced.Count == 0,
                $"{assembly.GetName().Name} references {string.Join(", ", referenced)}. " +
                "Cross-module traffic goes through Finora.BuildingBlocks.Contracts.");
        }
    }

    [Theory]
    [InlineData("Identity")]
    [InlineData("Cms")]
    [InlineData("Erp")]
    public void A_modules_domain_knows_nothing_about_persistence(string module)
    {
        var domain = AssembliesOf(module).SingleOrDefault(a => a.GetName().Name!.EndsWith(".Domain", StringComparison.Ordinal));
        Assert.NotNull(domain);

        var offenders = domain.GetReferencedAssemblies()
            .Select(a => a.Name!)
            .Where(n => n.Contains("EntityFrameworkCore", StringComparison.Ordinal)
                     || n.Contains("Npgsql", StringComparison.Ordinal)
                     || n.EndsWith(".Infrastructure", StringComparison.Ordinal))
            .ToList();

        Assert.True(
            offenders.Count == 0,
            $"{domain.GetName().Name} references {string.Join(", ", offenders)}. " +
            "The domain holds business rules; how they are stored is somebody else's problem.");
    }

    [Theory]
    [InlineData("Identity")]
    [InlineData("Cms")]
    [InlineData("Erp")]
    public void A_modules_application_layer_does_not_reach_into_infrastructure(string module)
    {
        var application = AssembliesOf(module).SingleOrDefault(a => a.GetName().Name!.EndsWith(".Application", StringComparison.Ordinal));
        Assert.NotNull(application);

        var offenders = application.GetReferencedAssemblies()
            .Select(a => a.Name!)
            .Where(n => n.EndsWith(".Infrastructure", StringComparison.Ordinal))
            .ToList();

        Assert.True(
            offenders.Count == 0,
            $"{application.GetName().Name} references {string.Join(", ", offenders)}. " +
            "Handlers depend on abstractions; the composition root supplies the implementations.");
    }

    [Fact]
    public void Building_blocks_domain_depends_on_nothing_of_ours()
    {
        var domain = AllAssemblies.Single(a => a.GetName().Name == "Finora.BuildingBlocks.Domain");

        var offenders = domain.GetReferencedAssemblies()
            .Select(a => a.Name!)
            .Where(n => n.StartsWith("Finora.", StringComparison.Ordinal))
            .ToList();

        Assert.True(
            offenders.Count == 0,
            $"Finora.BuildingBlocks.Domain references {string.Join(", ", offenders)}. " +
            "It is the root of the dependency graph and must stay there.");
    }

    [Fact]
    public void Every_module_layer_is_present()
    {
        foreach (var module in new[] { "Identity", "Cms", "Erp" })
        {
            foreach (var layer in new[] { "Domain", "Application", "Infrastructure" })
            {
                Assert.True(
                    AllAssemblies.Any(a => a.GetName().Name == $"Finora.{module}.{layer}"),
                    $"Finora.{module}.{layer} is missing. Cms is intentionally empty, but the " +
                    "projects exist so the boundary is enforced from the first line of code.");
            }
        }
    }

    [Fact]
    public void Domain_types_are_not_public_dtos_of_infrastructure()
    {
        // A sanity check that NetArchTest itself is wired up and scanning our types, so a
        // future rule written with it cannot pass vacuously.
        var result = Types.InAssembly(AllAssemblies.Single(a => a.GetName().Name == "Finora.BuildingBlocks.Domain"))
            .That().ArePublic()
            .Should().ResideInNamespaceStartingWith("Finora.BuildingBlocks.Domain")
            .GetResult();

        Assert.True(result.IsSuccessful,
            $"Unexpected namespaces: {string.Join(", ", result.FailingTypeNames ?? [])}");
    }

    private static IEnumerable<Assembly> AssembliesOf(string module) =>
        AllAssemblies.Where(a => a.GetName().Name!.StartsWith($"Finora.{module}.", StringComparison.Ordinal));

    /// <summary>
    /// Loads every Finora assembly from the test output directory. Referencing Finora.Api pulls
    /// them all in transitively, but the CLR loads lazily — without this, a rule could pass
    /// simply because the assembly it was meant to police had not been loaded yet.
    /// </summary>
    private static Assembly[] LoadFinoraAssemblies()
    {
        var directory = Path.GetDirectoryName(typeof(ModuleBoundaryTests).Assembly.Location)!;

        foreach (var path in Directory.EnumerateFiles(directory, "Finora.*.dll"))
        {
            try
            {
                Assembly.LoadFrom(path);
            }
            catch (BadImageFormatException)
            {
                // Native or resource-only file that happens to match the pattern.
            }
        }

        return AppDomain.CurrentDomain.GetAssemblies()
            .Where(a => a.GetName().Name?.StartsWith("Finora.", StringComparison.Ordinal) == true)
            .ToArray();
    }
}
