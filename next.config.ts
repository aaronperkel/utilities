import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mysql2 must stay a Node dependency, not get bundled
  serverExternalPackages: ["mysql2", "nodemailer"],
  async redirects() {
    return [
      // The bulk-email page moved under the portal in the 2026 refresh
      { source: "/email", destination: "/portal/email", permanent: true },
    ];
  },
};

export default nextConfig;
