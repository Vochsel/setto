import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @setto/core is a workspace package shipped as raw TypeScript (its `main` is
  // ./src/index.ts), so Next must transpile it. The remote MCP route imports
  // the shared tool layer from it.
  transpilePackages: ["@setto/core"],
};

export default nextConfig;
