import type { NextConfig } from "next";

// Frozen 2026-10-14: the household moved to Lejer. Every URL is a permanent redirect to the
// household's page there; the static "moved" page in app/ is only the fallback behind it.
const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/:path*", destination: "https://uselejer.com/77-n-union-st", permanent: true }];
  },
};

export default nextConfig;
