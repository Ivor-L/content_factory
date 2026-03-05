import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '192.168.78.125:3000', 'atomx.top', '*.atomx.top'],
    },
  },
};

export default nextConfig;
