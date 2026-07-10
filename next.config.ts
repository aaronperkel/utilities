import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mysql2 must stay a Node dependency, not get bundled
  serverExternalPackages: ["mysql2", "nodemailer"],
};

export default nextConfig;
