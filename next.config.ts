import type { NextConfig } from "next";
import { config } from "dotenv";

// dotenv 17 logs a line on every load unless told to be quiet.
config({ quiet: true });

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
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost"
      },
      {
        protocol: "https",
        hostname: "bundui-images.netlify.app"
      }
    ]
  }
};

export default nextConfig;
