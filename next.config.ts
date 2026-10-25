import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local database) ships its own WebAssembly files and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
