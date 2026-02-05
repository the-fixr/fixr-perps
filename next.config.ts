import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile @gmx-io/sdk since it's an ESM-only package
  transpilePackages: ['@gmx-io/sdk'],

  // Handle ESM packages that might have issues
  webpack: (config, { isServer }) => {
    // Fix for ESM modules
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
};

export default nextConfig;
