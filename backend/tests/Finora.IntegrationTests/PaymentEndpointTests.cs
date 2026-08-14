using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Finora.Erp.Domain;
using Finora.Erp.Infrastructure.Snapshot;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Finora.IntegrationTests;

/// <summary>
/// Payments and cheques over real HTTP.
///
/// <para>
/// Each test pins one rule that no other test pins, chosen for the ones a reimplementation gets
/// wrong quietly — where the wrong answer is a plausible number on a screen rather than an
/// exception.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public sealed class PaymentEndpointTests(ApiFixture fixture)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string Date = "2026-08-13T00:00:00Z";

    private static async Task<HttpClient> AsManagerAsync(ApiFixture fixture)
    {
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        (await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "amir@finora.app", password = "demo1234" })).EnsureSuccessStatusCode();
        return client;
    }

    /// <summary>One customer, one bank, one safe, and one confirmed sale invoice worth 1,000
    /// across two lines of 600 and 400.</summary>
    private async Task ResetAsync()
    {
        using var scope = fixture.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<SnapshotService>().ReplaceAsync(new ErpSnapshot
        {
            Customers = [new Customer { Id = "cust-am", Name = "Alco Metal Trading", Code = "AM" }],
            FinancialAccounts =
            [
                new FinancialAccount { Id = "acc-bank", Name = "ENBD Current", Type = FinancialAccountType.BANK, Currency = Currency.USD, AccountNumber = "0123456789", Iban = "AE070331234567890123456" },
                new FinancialAccount { Id = "acc-safe", Name = "Office Safe", Type = FinancialAccountType.CASH_SAFE, Currency = Currency.USD },
            ],
            Contracts =
            [
                new Contract
                {
                    Id = "ctr-1", CustomerId = "cust-am", Destination = "NINGBO",
                    Items = [new ContractItem { Id = "item-1", ContractId = "ctr-1", Product = "98% Copper Ingots", QuantityMt = 100m, RemainingMt = 100m }],
                },
            ],
            Invoices =
            [
                new Invoice
                {
                    Id = "inv-si-0001", InvoiceNumber = "SI-2026-0001",
                    InvoiceType = InvoiceType.SALE_INVOICE, Status = InvoiceStatus.CONFIRMED,
                    ContractId = "ctr-1", CustomerId = "cust-am", TotalAmount = 1000m,
                    Items =
                    [
                        new InvoiceItem { Id = "invitem-1", InvoiceId = "inv-si-0001", ContractItemId = "item-1", Product = "98% Copper Ingots", Amount = 600m, ReferenceDocumentItemId = "ref-1" },
                        new InvoiceItem { Id = "invitem-2", InvoiceId = "inv-si-0001", ContractItemId = "item-1", Product = "98% Copper Ingots", Amount = 400m, ReferenceDocumentItemId = "ref-2" },
                    ],
                },
            ],
        });
    }

    private static async Task<JsonElement> PostAsync(HttpClient c, string url, object? body = null)
    {
        var response = body is null
            ? await c.PostAsync(new Uri(url, UriKind.Relative), null)
            : await c.PostAsJsonAsync(new Uri(url, UriKind.Relative), body);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    private static async Task<JsonElement> ProblemAsync(HttpResponseMessage r) =>
        await r.Content.ReadFromJsonAsync<JsonElement>(Json);

    private static string Id(JsonElement r) => r.GetProperty("entity").GetProperty("id").GetString()!;

    /// <summary>A DRAFT payment on the header-and-lines flow — naming a type is what opts in.</summary>
    private static Task<JsonElement> DraftAsync(
        HttpClient c, decimal amount = 1000m, string type = "INVOICE", string currency = "USD") =>
        PostAsync(c, "/api/erp/payments", new
        {
            customerId = "cust-am", date = Date, amount, currency, fxRate = 1m,
            method = "TT", type, direction = "IN",
        });

    private static Task<JsonElement> AddLineAsync(
        HttpClient c, string paymentId, decimal amount, object? allocations = null) =>
        PostAsync(c, $"/api/erp/payments/{paymentId}/items", new
        {
            invoiceId = "inv-si-0001", date = Date, amount, currency = "USD", fxRate = 1m,
            method = "TT", bankAccountId = "acc-bank", allocations,
        });

    /* ------------------------------- The shape -------------------------------- */

    [Fact]
    public async Task Naming_a_type_opts_into_lines_and_omitting_one_settles_on_arrival()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var withLines = (await DraftAsync(c)).GetProperty("entity");
        Assert.Equal("DRAFT", withLines.GetProperty("status").GetString());
        Assert.Equal(0, withLines.GetProperty("items").GetArrayLength());

        // No type: the single-shot flow. The header IS the settlement, so it names no status and
        // carries no line collection — not an empty one, which would mean "lines belong here".
        var singleShot = (await PostAsync(c, "/api/erp/payments", new
        {
            customerId = "cust-am", date = Date, amount = 500m, currency = "USD", fxRate = 1m,
            method = "Cash", direction = "IN",
        })).GetProperty("entity");

        Assert.False(singleShot.TryGetProperty("status", out _));
        Assert.False(singleShot.TryGetProperty("items", out _));
    }

    [Fact]
    public async Task A_single_shot_payment_can_still_be_confirmed()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var id = Id(await PostAsync(c, "/api/erp/payments", new
        {
            customerId = "cust-am", date = Date, amount = 500m, currency = "USD", fxRate = 1m,
            method = "Cash", direction = "IN",
        }));

        // It has no lines and never will, so the empty-lines and header-versus-lines checks are
        // skipped. Treating its absent collection as an empty one refuses this with
        // `no-payment-items` and makes every legacy payment permanently unconfirmable.
        var confirmed = await PostAsync(c, $"/api/erp/payments/{id}/status", new { status = "CONFIRMED" });
        Assert.Equal("CONFIRMED", confirmed.GetProperty("entity").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Confirming_a_single_shot_payment_does_not_strand_it()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var id = Id(await PostAsync(c, "/api/erp/payments", new
        {
            customerId = "cust-am", date = Date, amount = 500m, currency = "USD", fxRate = 1m,
            method = "Cash", direction = "IN",
        }));

        // Confirm, reopen, confirm again — the ordinary way a mistake gets corrected.
        await PostAsync(c, $"/api/erp/payments/{id}/status", new { status = "CONFIRMED" });
        await PostAsync(c, $"/api/erp/payments/{id}/status", new { status = "DRAFT" });
        var again = await PostAsync(c, $"/api/erp/payments/{id}/status", new { status = "CONFIRMED" });

        // If the status write destroys the shape, this payment is stranded in DRAFT forever and
        // its money leaves every balance — the exact failure the third state exists to prevent,
        // arriving one layer further in.
        Assert.Equal("CONFIRMED", again.GetProperty("entity").GetProperty("status").GetString());
    }

    /* ------------------------------ Confirming -------------------------------- */

    [Fact]
    public async Task Confirming_needs_the_lines_to_add_up_to_the_header()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c, amount: 1000m));

        var empty = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/status", UriKind.Relative), new { status = "CONFIRMED" });
        Assert.Equal("no-payment-items", (await ProblemAsync(empty)).GetProperty("code").GetString());

        await AddLineAsync(c, id, 600m);

        var short_ = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/status", UriKind.Relative), new { status = "CONFIRMED" });
        var problem = await ProblemAsync(short_);

        // Both figures cross the wire: the dialog shows the user what it declared against what
        // the lines actually settle.
        Assert.Equal("payment-total-mismatch", problem.GetProperty("code").GetString());
        Assert.Equal(1000m, problem.GetProperty("headerUSD").GetDecimal());
        Assert.Equal(600m, problem.GetProperty("linesUSD").GetDecimal());

        await AddLineAsync(c, id, 400m);
        var ok = await PostAsync(c, $"/api/erp/payments/{id}/status", new { status = "CONFIRMED" });
        Assert.Equal("CONFIRMED", ok.GetProperty("entity").GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_dirham_header_is_measured_against_the_global_rate()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // AED 3,672.50 with fxRate 1 — exactly what the header form posts, because it has no rate
        // field. Through the global 3.6725 that is USD 1,000; through the header's own stored
        // rate it would be USD 3,672.50 and could never match any set of lines.
        var id = Id(await DraftAsync(c, amount: 3672.50m, currency: "AED"));
        await AddLineAsync(c, id, 600m);
        await AddLineAsync(c, id, 400m);

        var ok = await PostAsync(c, $"/api/erp/payments/{id}/status", new { status = "CONFIRMED" });
        Assert.Equal("CONFIRMED", ok.GetProperty("entity").GetProperty("status").GetString());
    }

    /* ------------------------------ Allocations ------------------------------- */

    [Fact]
    public async Task An_omitted_split_fills_the_invoices_lines_in_order()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c));

        var line = (await AddLineAsync(c, id, 800m)).GetProperty("entity")
            .GetProperty("items")[0].GetProperty("allocations");

        // 600 to the first line, 200 to the second — first to last, each taking what it owes.
        Assert.Equal(2, line.GetArrayLength());
        Assert.Equal("invitem-1", line[0].GetProperty("invoiceItemId").GetString());
        Assert.Equal(600m, line[0].GetProperty("amount").GetDecimal());
        Assert.Equal(200m, line[1].GetProperty("amount").GetDecimal());

        // The chain-stable key comes from the invoice, never the caller — it is what survives a
        // provisional becoming a final document.
        Assert.Equal("ref-1", line[0].GetProperty("referenceDocumentItemId").GetString());
    }

    [Fact]
    public async Task A_split_may_not_pay_a_line_more_than_it_owes()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c));

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/items", UriKind.Relative), new
            {
                invoiceId = "inv-si-0001", date = Date, amount = 700m, currency = "USD",
                fxRate = 1m, method = "TT", bankAccountId = "acc-bank",
                allocations = new[] { new { invoiceItemId = "invitem-1", amount = 700m } },
            });

        Assert.Equal("over-allocated", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_split_must_add_up_to_the_line()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c));

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/items", UriKind.Relative), new
            {
                invoiceId = "inv-si-0001", date = Date, amount = 600m, currency = "USD",
                fxRate = 1m, method = "TT", bankAccountId = "acc-bank",
                allocations = new[] { new { invoiceItemId = "invitem-1", amount = 500m } },
            });

        Assert.Equal("allocation-mismatch", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Only_confirmed_payments_reserve_an_invoice_line()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        // A draft takes 600 of the first line...
        var draft = Id(await DraftAsync(c));
        await AddLineAsync(c, draft, 600m);

        // ...and a rival may still claim the same 600, because a draft settles nothing. Two
        // drafts can therefore each pass, which is why confirming re-checks.
        var rival = Id(await DraftAsync(c));
        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{rival}/items", UriKind.Relative), new
            {
                invoiceId = "inv-si-0001", date = Date, amount = 600m, currency = "USD",
                fxRate = 1m, method = "TT", bankAccountId = "acc-bank",
                allocations = new[] { new { invoiceItemId = "invitem-1", amount = 600m } },
            });

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Editing_a_line_does_not_count_it_against_itself()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c, amount: 600m));

        var added = await AddLineAsync(c, id, 600m);
        var itemId = added.GetProperty("entity").GetProperty("items")[0].GetProperty("id").GetString();
        await PostAsync(c, $"/api/erp/payments/{id}/status", new { status = "CONFIRMED" });
        await PostAsync(c, $"/api/erp/payments/{id}/status", new { status = "DRAFT" });

        // Re-saving the same line, unchanged, on a payment that is now CONFIRMED-then-reopened.
        // Counting the payment's own allocation against it would refuse this as over-allocated.
        var response = await c.PutAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/items/{itemId}", UriKind.Relative), new
            {
                invoiceId = "inv-si-0001", date = Date, amount = 600m, currency = "USD",
                fxRate = 1m, method = "TT", bankAccountId = "acc-bank",
                allocations = new[] { new { invoiceItemId = "invitem-1", amount = 600m } },
            });

        response.EnsureSuccessStatusCode();
    }

    /* -------------------------------- Methods --------------------------------- */

    [Fact]
    public async Task A_transfer_names_a_bank_and_cash_names_a_safe()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c));

        // A cash line pointing at a bank. Both name the account in the SAME field, so only the
        // account's own type tells them apart — without this the two become indistinguishable in
        // every balance and report that reads the field.
        var crossed = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/items", UriKind.Relative), new
            {
                invoiceId = "inv-si-0001", date = Date, amount = 600m, currency = "USD",
                fxRate = 1m, method = "Cash", bankAccountId = "acc-bank",
                allocations = new[] { new { invoiceItemId = "invitem-1", amount = 600m } },
            });

        Assert.Equal("account-type-mismatch", (await ProblemAsync(crossed)).GetProperty("code").GetString());

        var missing = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/items", UriKind.Relative), new
            {
                invoiceId = "inv-si-0001", date = Date, amount = 600m, currency = "USD",
                fxRate = 1m, method = "TT",
                allocations = new[] { new { invoiceItemId = "invitem-1", amount = 600m } },
            });

        Assert.Equal("bank-account-required", (await ProblemAsync(missing)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Money_on_account_refuses_a_document()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c, type: "GENERAL"));

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/items", UriKind.Relative), new
            {
                invoiceId = "inv-si-0001", date = Date, amount = 100m, currency = "USD",
                fxRate = 1m, method = "Cash", bankAccountId = "acc-safe",
            });

        // Refused rather than ignored: a caller sending the wrong shape is told, instead of
        // having half its input silently dropped.
        Assert.Equal("invoice-not-allowed", (await ProblemAsync(response)).GetProperty("code").GetString());

        // Without the document it is accepted, and settles nothing in particular.
        var ok = await PostAsync(c, $"/api/erp/payments/{id}/items", new
        {
            date = Date, amount = 100m, currency = "USD", fxRate = 1m,
            method = "Cash", bankAccountId = "acc-safe",
        });

        Assert.Equal(0, ok.GetProperty("entity").GetProperty("items")[0]
            .GetProperty("allocations").GetArrayLength());
    }

    [Fact]
    public async Task A_confirmed_payment_refuses_every_edit()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c, amount: 600m));
        await AddLineAsync(c, id, 600m);
        await PostAsync(c, $"/api/erp/payments/{id}/status", new { status = "CONFIRMED" });

        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/items", UriKind.Relative), new
            {
                invoiceId = "inv-si-0001", date = Date, amount = 100m, currency = "USD",
                fxRate = 1m, method = "TT", bankAccountId = "acc-bank",
            });

        Assert.Equal("payment-confirmed", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    /* -------------------------------- Cheques --------------------------------- */

    private static object Cheque(string number = "000123", string bank = "ENBD") => new
    {
        type = "NORMAL", number, bankName = bank, dueDate = Date,
        amount = 600m, currency = "USD", ownerName = "Alco Metal Trading",
    };

    [Fact]
    public async Task A_cheque_number_is_unique_per_bank_whatever_the_typing()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        await PostAsync(c, "/api/erp/cheques", Cheque());

        // Another bank may legitimately issue the same number.
        (await c.PostAsJsonAsync(new Uri("/api/erp/cheques", UriKind.Relative), Cheque(bank: "Mashreq")))
            .EnsureSuccessStatusCode();

        // The same bank may not — and "enbd " is the same bank. Compared trimmed and
        // case-insensitively, or the register quietly grows a second namespace per spelling.
        var clash = await c.PostAsJsonAsync(
            new Uri("/api/erp/cheques", UriKind.Relative), Cheque(bank: "enbd "));

        Assert.Equal("duplicate-cheque-number",
            (await ProblemAsync(clash)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_returned_cheques_number_may_be_used_again()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);

        var id = Id(await PostAsync(c, "/api/erp/cheques", Cheque()));
        await PostAsync(c, $"/api/erp/cheques/{id}/status", new { status = "RETURNED" });

        // Which is exactly how a bounced cheque is replaced: the customer re-issues the same
        // number. Enforcing uniqueness against returned cheques makes that impossible.
        (await c.PostAsJsonAsync(new Uri("/api/erp/cheques", UriKind.Relative), Cheque()))
            .EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Clearing_a_cheque_names_a_live_account_and_un_clearing_forgets_it()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await PostAsync(c, "/api/erp/cheques", Cheque()));

        var noAccount = await c.PostAsJsonAsync(
            new Uri($"/api/erp/cheques/{id}/status", UriKind.Relative), new { status = "PAID" });
        Assert.Equal("bank-account-required",
            (await ProblemAsync(noAccount)).GetProperty("code").GetString());

        var paid = await PostAsync(c, $"/api/erp/cheques/{id}/status",
            new { status = "PAID", bankAccountId = "acc-bank" });
        Assert.Equal("acc-bank", paid.GetProperty("entity").GetProperty("bankAccountId").GetString());

        // Leaving PAID drops the account. Without that, an uncleared cheque goes on reporting a
        // bank it is no longer in.
        var reopened = await PostAsync(c, $"/api/erp/cheques/{id}/status", new { status = "PENDING" });
        Assert.Equal(JsonValueKind.Null,
            reopened.GetProperty("entity").GetProperty("bankAccountId").ValueKind);
    }

    [Fact]
    public async Task A_cheque_is_editable_only_while_it_is_pending()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await PostAsync(c, "/api/erp/cheques", Cheque()));

        await PostAsync(c, $"/api/erp/cheques/{id}/status",
            new { status = "PAID", bankAccountId = "acc-bank" });

        var response = await c.PutAsJsonAsync(
            new Uri($"/api/erp/cheques/{id}", UriKind.Relative), Cheque(number: "000999"));

        // A cleared cheque is a historical fact, and its amount is what the payment lines pointing
        // at it are worth. Correcting one means un-clearing it first, deliberately.
        Assert.Equal("cheque-not-pending", (await ProblemAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task A_rejected_line_leaves_no_cheque_behind()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c));

        // A well-formed inline cheque on a line whose SPLIT is wrong. The cheque is validated
        // early and minted last, so the line's failure must take it with it.
        var response = await c.PostAsJsonAsync(
            new Uri($"/api/erp/payments/{id}/items", UriKind.Relative), new
            {
                invoiceId = "inv-si-0001", date = Date, amount = 600m, currency = "USD",
                fxRate = 1m, method = "Cheque", cheque = Cheque(number: "ORPHAN-1"),
                allocations = new[] { new { invoiceItemId = "invitem-1", amount = 500m } },
            });

        Assert.Equal("allocation-mismatch", (await ProblemAsync(response)).GetProperty("code").GetString());

        var cheques = await c.GetFromJsonAsync<JsonElement>(
            new Uri("/api/erp/cheques", UriKind.Relative), Json);

        Assert.DoesNotContain(cheques.EnumerateArray(),
            x => x.GetProperty("number").GetString() == "ORPHAN-1");
    }

    [Fact]
    public async Task A_cheque_line_mints_its_cheque_and_points_at_it()
    {
        await ResetAsync();
        using var c = await AsManagerAsync(fixture);
        var id = Id(await DraftAsync(c, amount: 600m));

        var result = await PostAsync(c, $"/api/erp/payments/{id}/items", new
        {
            invoiceId = "inv-si-0001", date = Date, amount = 600m, currency = "USD",
            fxRate = 1m, method = "Cheque", cheque = Cheque(),
            allocations = new[] { new { invoiceItemId = "invitem-1", amount = 600m } },
        });

        var chequeId = result.GetProperty("entity").GetProperty("items")[0]
            .GetProperty("chequeId").GetString();
        Assert.NotNull(chequeId);

        // The register comes back with the write, because the line created a cheque nobody named.
        var minted = result.GetProperty("cheques").EnumerateArray()
            .Single(x => x.GetProperty("id").GetString() == chequeId);
        Assert.Equal("PENDING", minted.GetProperty("status").GetString());
    }

    /* ------------------------------- Permission ------------------------------- */

    [Fact]
    public async Task Payments_need_the_payments_permission()
    {
        await ResetAsync();
        var client = fixture.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        await client.PostAsJsonAsync(new Uri("/api/identity/login", UriKind.Relative),
            new { email = "staff@finora.app", password = "Staff@2026" });

        var response = await client.GetAsync(new Uri("/api/erp/payments", UriKind.Relative));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        client.Dispose();
    }
}
