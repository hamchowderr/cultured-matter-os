import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LinkedIn Connections.csv uploads go through a server action.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // The service worker must never be served from a cache, or updates would not reach the phone.
  // Headers from the Next.js PWA guide.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" }
        ]
      }
    ];
  }
};

export default nextConfig;
