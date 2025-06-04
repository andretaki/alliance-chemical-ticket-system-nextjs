import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block' // Consider if this is still needed, modern browsers have strong built-in XSS protection.
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'Permissions-Policy',
    // Start with a restrictive policy and open up as needed.
    // Example: 'camera=(), microphone=(), geolocation=(), payment=()'
    value: 'camera=(), microphone=(), geolocation=()' 
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin' // Or 'strict-origin-when-cross-origin' or 'no-referrer' depending on needs
  },
  // Content-Security-Policy is highly recommended but very configuration-specific.
  // It needs to be tailored to your app's resources (scripts, styles, fonts, etc.)
  // Example (very restrictive, will likely need to be expanded):
  // {
  //   key: 'Content-Security-Policy',
  //   value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';"
  // }
];

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
  async headers() {
    return [
      {
        // Apply these headers to all routes in your application.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
