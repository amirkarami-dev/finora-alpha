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

## Authentication

The ERP panel and the API are one origin (the vite proxy in development, one traefik host in
production), so the session is a **cookie**, not a token: `HttpOnly` so no script can read it,
`SameSite=Strict` so nothing cross-site can ride it, and nothing persisted in the browser at all.
`POST /api/identity/login` sets it, `GET /api/identity/me` reports the current user with their
permissions, `POST /api/identity/logout` clears it.

An OIDC surface (OpenIddict) is deliberately **not** here yet. A redirect flow buys a
same-origin first-party SPA nothing while costing it the branded login page, and OpenIddict is
additive when a second client — land-web-panel, or a mobile app — actually needs it.

Permissions are strings, and today every one of them is a front-end route key
(`dashboard`, `payments`, `baseInfo`). `AccessCatalogue` mirrors `apps/erp-panel/src/config/
roles.ts` exactly, and an integration test compares them, because the failure mode otherwise is
a menu item that silently appears or disappears for one role. Finer-grained codes
(`erp.sales.invoice.create`) are rows, not a schema change.

**Seeded passwords.** The four demo accounts use their published passwords only when
`Identity:AllowDemoPasswords` is set, which happens in development and in the integration tests.
Production must supply `Identity:SeedPasswords:<email>`; without one the account is created with
a random secret nobody holds, because seeding a published password into a production database is
the same as having no password.

## Status

Phases 1 and 2 are complete: solution, orchestration, telemetry, OpenAPI, the error contract,
the guard rails, and the `identity` schema with real sign-in. The ERP tables land in phase 3.
The Cms projects exist and are deliberately empty, so the module boundary is enforced from the
first line of CMS code rather than retrofitted.
