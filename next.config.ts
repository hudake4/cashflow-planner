import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server in .next/standalone, which the Electron desktop app loads in-process.
  output: "standalone",
  // Local-only app: never send telemetry-style data anywhere from the server.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
