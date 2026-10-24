import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Local-only app: never send telemetry-style data anywhere from the server.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
