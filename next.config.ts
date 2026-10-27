import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Uploads are streamed through a route handler; keep the body limit generous
    // for self-hosted deployments (Vercel caps request bodies at ~4.5 MB anyway,
    // which is why the client uploads files in chunks).
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
