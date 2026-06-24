import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React strict mode for detecting side effects
  reactStrictMode: true,

  // Enable compression (gzip/brotli)
  compress: true,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24, // 24 hours
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Production optimizations
  poweredByHeader: false,
  generateEtags: true,

  // Experimental optimizations
  experimental: {
    optimizePackageImports: ['recharts'],
  },
};

export default nextConfig;
