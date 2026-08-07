# Runtime image for the prebuilt Next.js standalone server.
#
# Build the app FIRST on a machine with resources (or CI):
#     npm run build -w @finora/land-web    # produces .next/standalone + .next/static
# then `docker build` here just assembles the runtime — no npm, low memory.
# (The target VPS shares a box with ~50 other containers and has ~5 GB RAM free, so we
# deliberately avoid running `next build` inside Docker there.)
#
# Build context is the REPO ROOT.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone bundle ships its own minimal node_modules + server.js. The layout is flat
# because next.config.mjs pins outputFileTracingRoot to the app directory — without that,
# Next infers the repo root and nests everything under apps/land-web/.
COPY apps/land-web/.next/standalone/ ./
COPY apps/land-web/.next/static ./.next/static
COPY apps/land-web/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
