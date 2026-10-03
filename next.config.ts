import type { NextConfig } from "next";
import { config } from "dotenv";

// dotenv 17 logs a line on every load unless told to be quiet.
config({ quiet: true });

const nextConfig: NextConfig = {
  // LinkedIn Connections.csv uploads go through a server action.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
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
