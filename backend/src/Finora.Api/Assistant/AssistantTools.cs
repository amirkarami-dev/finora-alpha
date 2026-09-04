using System.Text.Json;
using System.Text.Json.Nodes;

namespace Finora.Api.Assistant;

/// <summary>
/// The read-only tools the model may ask for. The browser runs them (spec §2); the server's only
/// job is to offer each one solely to callers who hold one of its permissions, so a session that
/// cannot open the Reports page cannot get a balance through the model either.
/// </summary>
public static class AssistantTools
{
    public sealed record Tool(string Name, string Description, string ParametersJson, string[] Permissions);

    private const string NoParams = """{"type":"object","properties":{}}""";

    public static IReadOnlyList<Tool> All { get; } =
    [
        new("find_persons",
            "Finds persons (customers, suppliers, others) by part of their name or code. Returns id, name, type, code and a link. " +
            "Names are stored in English/Latin script; search with the likely English spelling.",
            """{"type":"object","properties":{"query":{"type":"string","description":"Part of the name or code"}},"required":["query"]}""",
            ["customers", "reports", "executive"]),
        new("get_person_balance",
            "The balance of one person in USD: invoiced, paid, outstanding, overdue, net (positive = they owe us).",
            """{"type":"object","properties":{"personId":{"type":"string"}},"required":["personId"]}""",
            ["reports", "executive"]),
        new("list_open_invoices",
            "Open sale invoices with total, paid and outstanding USD; or, for side PURCHASE, confirmed purchase invoices with their total USD. Optionally for one person. Returns number, date, person, status and a link.",
            """{"type":"object","properties":{"personId":{"type":"string"},"side":{"type":"string","enum":["SALE","PURCHASE"]}}}""",
            ["sale", "purchase", "reports", "executive"]),
        new("get_stock_levels",
            "Stock per warehouse and product: quantity MT, value USD and cost per MT. Optional warehouse name " +
            "filter. Warehouse names are in the app's data language; when unsure omit the filter.",
            """{"type":"object","properties":{"warehouse":{"type":"string"}}}""",
            ["warehouse"]),
        new("list_contracts",
            "Contracts, optionally for one person: id, person, product, contracted MT, remaining MT, status and a link.",
            """{"type":"object","properties":{"personId":{"type":"string"}}}""",
            ["contracts", "reports", "executive"]),
        new("get_contract_remaining",
            "For one contract: each goods line with contracted MT and MT not yet invoiced.",
            """{"type":"object","properties":{"contractId":{"type":"string"}},"required":["contractId"]}""",
            ["contracts", "reports", "executive"]),
        new("find_document",
            "Finds a trade document (order, provisional or invoice) by its number. Returns type, person, date, total USD, status and a link.",
            """{"type":"object","properties":{"number":{"type":"string"}},"required":["number"]}""",
            ["sale", "purchase", "reports", "executive"]),
        new("get_dashboard_summary",
            "Company summary: total outstanding, overdue, invoiced and collected this month, active contracts, customers.",
            NoParams,
            ["dashboard", "executive"]),
    ];

    /// <summary>OpenAI-shaped tool definitions for the tools this caller may use.</summary>
    public static JsonArray For(IReadOnlySet<string> permissions)
    {
        var array = new JsonArray();
        foreach (var tool in All.Where(t => t.Permissions.Any(permissions.Contains)))
        {
            array.Add(new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"] = tool.Name,
                    ["description"] = tool.Description,
                    ["parameters"] = JsonNode.Parse(tool.ParametersJson),
                },
            });
        }

        return array;
    }
}
