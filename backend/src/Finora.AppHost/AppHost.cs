// Aspire orchestrates the local development environment and, through it, the telemetry story.
// It is NOT the business architecture: the modular monolith lives inside Finora.Api.
//
// Production runs the same two executables as plain containers behind traefik (see
// deploy/docker-compose.yml); Aspire's job there is only to have made the wiring explicit.

var builder = DistributedApplication.CreateBuilder(args);

// PostgreSQL 17 to match the server (17.10). Pinning the tag means a version difference can
// never be the reason a migration behaves differently here than there.
var postgres = builder.AddPostgres("postgres")
    .WithImage("postgres", "17-alpine")
    .WithDataVolume("finora-pgdata")
    .WithPgAdmin();

// One database, schema-per-module inside it (identity, cms, erp, platform). One database keeps
// a cross-module operation — confirming an invoice and writing its outbox row — in a single
// transaction, which separate databases would force us to give up for nothing.
var finoraDb = postgres.AddDatabase("finora");

var redis = builder.AddRedis("cache");

// Runs pending migrations, then exits. Kept separate from the API so that starting an extra
// API replica can never race another replica's schema change.
var migrator = builder.AddProject<Projects.Finora_Migrator>("migrator")
    .WithReference(finoraDb)
    .WaitFor(finoraDb);

builder.AddProject<Projects.Finora_Api>("api")
    .WithReference(finoraDb)
    .WithReference(redis)
    .WaitFor(redis)
    // The API starts only once the schema is current, so a request can never hit a half-migrated
    // database during startup.
    .WaitForCompletion(migrator)
    .WithHttpHealthCheck("/health")
    .WithExternalHttpEndpoints();

builder.Build().Run();
