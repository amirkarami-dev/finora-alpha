# Finora API — .NET 10, multi-stage.
#
# Build context is the REPO ROOT (the solution needs backend/ in full, and the domain assembly
# embeds backend/contracts/error-codes.json).
#
# Built LOCALLY and shipped, never built on the server: that box runs ~50 containers with about
# 5 GB of RAM free and 13 GB of disk, and a restore + publish there would be the heaviest thing
# on it. The two front ends already follow the same rule.

FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

# Restore first, on just the project graph, so a source-only change reuses the package layer.
COPY backend/Directory.Build.props backend/Directory.Packages.props backend/Finora.slnx ./backend/
COPY backend/src ./backend/src
COPY backend/tests ./backend/tests
COPY backend/contracts ./backend/contracts
RUN dotnet restore backend/Finora.slnx

RUN dotnet publish backend/src/Finora.Api/Finora.Api.csproj \
    -c Release -o /app/api --no-restore
RUN dotnet publish backend/src/Finora.Migrator/Finora.Migrator.csproj \
    -c Release -o /app/migrator --no-restore

# ── API runtime ────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS api
WORKDIR /app
# Never run as root: this container is reachable from the internet through traefik.
RUN adduser -D -u 64198 finora && chown -R finora /app
# Created here, owned by the app user, so the named volume compose mounts over it inherits that
# ownership. A volume mounted onto a path that does not exist in the image arrives root-owned,
# and a non-root process cannot write its data-protection keys into it.
RUN mkdir -p /keys && chown finora /keys
USER finora
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_gcServer=1 \
    DataProtection__KeyPath=/keys
COPY --from=build --chown=finora /app/api ./
EXPOSE 8080
ENTRYPOINT ["dotnet", "Finora.Api.dll"]

# ── Migrator: same build, different entry point. Runs once and exits. ──────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS migrator
WORKDIR /app
RUN adduser -D -u 64198 finora && chown -R finora /app
USER finora
COPY --from=build --chown=finora /app/migrator ./
ENTRYPOINT ["dotnet", "Finora.Migrator.dll"]
