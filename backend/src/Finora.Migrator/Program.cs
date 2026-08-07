using Finora.Migrator;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddHostedService<MigrationRunner>();

var host = builder.Build();
await host.RunAsync();
