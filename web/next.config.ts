import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One .env at the repo root configures both apps; Next.js would otherwise only read web/.env*
loadEnvConfig(path.resolve(import.meta.dirname, ".."));

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The floating dev badge sits over the side rail
  devIndicators: false,
  // The shared package ships TypeScript source
  transpilePackages: ["@cueline/shared"],
};

export default nextConfig;
