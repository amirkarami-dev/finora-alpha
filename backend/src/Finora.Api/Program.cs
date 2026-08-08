using Finora.Api.Endpoints;
using Finora.Api.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Finora.Erp.Infrastructure;
using Finora.Identity.Infrastructure;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// OpenTelemetry, health-check endpoints, service discovery and HTTP resilience.
builder.AddServiceDefaults();

// Every failure leaves as RFC 9457 ProblemDetails carrying a machine-readable `code`, which is
// the contract the SPA's error handling is built on. See DomainExceptionHandler.
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<DomainExceptionHandler>();

// The session cookie is encrypted with data-protection keys. By default those keys live inside
// the container, so every redeploy mints a new set and signs every user out — and a container
// that restarts under load would do it mid-session. Pointing them at a mounted directory keeps
// them across deploys. Unset in development, where the default is exactly right.
var keyPath = builder.Configuration["DataProtection:KeyPath"];
if (!string.IsNullOrWhiteSpace(keyPath))
{
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(keyPath))
        .SetApplicationName("Finora");
}

builder.AddFinoraAuthentication();
builder.AddIdentityModule();
builder.AddErpModule();

builder.Services.AddOpenApi();

var app = builder.Build();

app.UseExceptionHandler();

app.UseAuthentication();
app.UseAuthorization();

// The generated document is what packages/api-client's types are generated from, so it is
// served in every environment — a contract that only exists in development is not a contract.
app.MapOpenApi();
app.MapScalarApiReference(options => options.WithTitle("Finora API"));

app.MapMetaEndpoints();
app.MapIdentityEndpoints();
app.MapUserAdminEndpoints();
app.MapErpEndpoints();
app.MapMasterDataEndpoints();

// Off unless a test switches it on. See DiagnosticEndpoints for why the seam exists at all.
if (app.Configuration.GetValue<bool>("Api:EnableDiagnosticEndpoints"))
{
    app.MapDiagnosticEndpoints();
}

// /health and /alive, from ServiceDefaults. Development-only there by default; this app has no
// public ingress on those paths (traefik routes /api only), so they stay available everywhere.
app.MapDefaultEndpoints();

app.Run();

/// <summary>Exposed so the integration tests can drive the real pipeline via WebApplicationFactory.</summary>
public partial class Program;
