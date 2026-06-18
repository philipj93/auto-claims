import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Compile the shared workspace package from source.
  transpilePackages: ['@repo/types'],
};

export default nextConfig;
