import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle (.next/standalone) for a small Docker image.
  output: "standalone",
  // This app lives in a monorepo whose root has its own lockfile, so Next would otherwise
  // infer the REPO root as the tracing root and nest the standalone bundle under
  // .next/standalone/apps/land-web/. Pinning it here keeps that output flat and keeps the
  // Dockerfile's COPY paths stable.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  eslint: {
    // ESLint isn't wired into the dependency set yet; type-checking via tsc
    // still runs during `next build`. Run `npm run lint` after adding it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
