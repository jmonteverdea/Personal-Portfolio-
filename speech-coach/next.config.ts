import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This app lives in a subfolder of another repo. Pin the root so Next does
  // not pick up a lockfile from a parent directory.
  turbopack: { root: __dirname },
};

export default nextConfig;
