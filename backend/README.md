# Finora backend

.NET 10 modular monolith behind all three front ends. `api.metal-uae.com` in production.

## Running it

```bash
dotnet run --project backend/src/Finora.AppHost
```

Aspire starts PostgreSQL 17, Redis and pgAdmin as containers, runs the migrator to completion,
then starts the API on **http://localhost:5080** — the port `apps/erp-panel/vite.config.ts`
proxies `/api` to, so `npm run dev` needs no extra configuration. The dashboard URL (with its
login token) is printed on startup.

```bash
dotnet build backend/Finora.slnx     # warnings are errors
dotnet test  backend/Finora.slnx     # unit + architecture + integration
```

## Layout

```
backend/
├─ contracts/error-codes.json          the 85 error codes, extracted from api.ts
├─ Directory.Packages.props            every package version, centrally managed
├─ src/
│  ├─ Finora.AppHost                   Aspire: postgres + redis + migrator + api
│  ├─ Finora.ServiceDefaults           OpenTelemetry, health, resilience
│  ├─ Finora.Api                       Minimal APIs, OpenAPI, ProblemDetails
│  ├─ Finora.Migrator                  one-shot migration runner
│  ├─ BuildingBlocks/{Domain,Application,Infrastructure,Contracts}
│  └─ Modules/{Identity,Cms,Erp}/{Domain,Application,Infrastructure}
└─ tests/{UnitTests,ArchitectureTests,IntegrationTests}
```

## The rules that are enforced, not just written down

`Finora.ArchitectureTests` fails the build on any of these:

- **No module references another module.** Identity, Cms and Erp talk through
  `BuildingBlocks.Contracts`. This is what keeps "extract a module into its own service later"
  a real option rather than a hope.
- **A module's Domain knows nothing about persistence** — no EF Core, no Npgsql, no
  Infrastructure.
- **The Application layer never reaches into Infrastructure.** The composition root supplies
  implementations.
- **`Math.Round` is called in exactly one file.** C# rounds midpoints to even; the front end
  rounds half away from zero. One default call site is one cent of divergence on some invoice,
  found months later as a balance that will not reconcile. Everything goes through
  `BuildingBlocks.Domain.Rounding`.
- **No `float`/`double` in a domain file.** Money is `decimal`; the cent-exact allocation split
  depends on exact arithmetic.

## Error contract

Every failure leaves as RFC 9457 ProblemDetails with a machine code in `extensions.code`, and
any payload flattened alongside it:

```json
{
  "status": 422,
  "type": "https://finora.metal-uae.com/errors/qty-exceeds-remaining",
  "code": "qty-exceeds-remaining",
  "available": 55,
  "remainingMt": 27.5
}
```

That shape is not decorative. The SPA's `ApiError` sets `message` to the bare code and copies
the extensions onto the error object, so a component that already does
`if (e.message === 'qty-exceeds-remaining') show(e.available)` keeps working without being
touched. `422` is a refused business rule, `404` a missing record, `400` a malformed request,
`500` returns a trace id and nothing else.

`GET /api/meta/error-codes` serves the contract so CI can diff it against what `api.ts` throws.

## Status

Phase 1 (walking skeleton) is complete: solution, orchestration, telemetry, OpenAPI, the error
contract and the guard rails. There is **no schema yet** — Identity lands in phase 2 and the ERP
tables in phase 3. The Cms projects exist and are deliberately empty, so the module boundary is
enforced from the first line of CMS code rather than retrofitted.
