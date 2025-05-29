import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: ['cdn.shopify.com'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    }
  },
};

export default nextConfig;
