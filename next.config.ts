import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

// Serwist configuration — only enabled in production builds.
// In development, the service worker is disabled to avoid caching issues.
// To build with Serwist: `bun run build` (uses @serwist/next plugin)
// The actual SW file is at src/app/sw.ts and is auto-registered by the plugin.
export default nextConfig;
