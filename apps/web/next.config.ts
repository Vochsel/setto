import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @setto/core is a workspace package shipped as raw TypeScript (its `main` is
  // ./src/index.ts), so Next must transpile it. The remote MCP route imports
  // the shared tool layer from it.
  transpilePackages: ["@setto/core"],
  // Allow next/image (and its edge-cached optimizer) to serve our media hosts.
  // R2 (pub-*.r2.dev) is the primary store for originals + thumbnails; Convex
  // storage holds pre-R2 media; fal is the fallback for not-yet-synced media.
  // AVIF/WebP shave bytes further on top of the thumbnail.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.convex.cloud" },
      { protocol: "https", hostname: "*.convex.site" },
      { protocol: "https", hostname: "*.fal.media" },
      { protocol: "https", hostname: "fal.media" },
      { protocol: "https", hostname: "*.fal.run" },
    ],
  },
};

export default nextConfig;
