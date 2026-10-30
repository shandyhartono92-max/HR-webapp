import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Lets other computers on the LAN use the dev server (this PC's IP; update it if it changes)
  allowedDevOrigins: ["192.168.100.115", "127.0.0.1"],
  experimental: {
    // CV uploads are up to 5 MB; leave room for the other form fields
    serverActions: { bodySizeLimit: "6mb" },
  },
  async redirects() {
    return [{ source: "/", destination: "/karir", permanent: false }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
