import { hostname, networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Lets other devices on the office/home network (e.g. a MacBook) use the dev server.
// Read at startup, so a new Wi-Fi address is picked up on the next `npm run dev`.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  cacheComponents: true,
  allowedDevOrigins: ["127.0.0.1", ...lanAddresses, hostname(), `${hostname()}.local`],
  experimental: {
    // Signed contract PDFs are up to 10 MB (CVs 5 MB). Both limits sit above that, so a
    // slightly bigger file reaches the action and gets a clear message instead of a cut-off
    // body. proxyClientMaxBodySize: proxy.ts buffers request bodies, by default only 10 MB.
    serverActions: { bodySizeLimit: "12mb" },
    proxyClientMaxBodySize: "12mb",
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
