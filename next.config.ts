import type { NextConfig } from "next";
import { config } from "dotenv";

config();

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
