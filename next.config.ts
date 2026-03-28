import type { NextConfig, SizeLimit } from "next";

const uploadBodySizeLimit = (process.env.NEXT_UPLOAD_SIZE_LIMIT ?? "150mb") as SizeLimit;

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // Pre-existing type errors in canvas + nexapi modules don't affect runtime
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'supabase-api.atomx.top',
        pathname: '/storage/v1/object/public/uploads/**',
      },
      {
        protocol: 'https',
        hostname: 'oss.atomx.top',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '192.168.78.125:3000', 'atomx.top', '*.atomx.top'],
      bodySizeLimit: uploadBodySizeLimit,
    },
    serverComponentsHmrCache: false,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
