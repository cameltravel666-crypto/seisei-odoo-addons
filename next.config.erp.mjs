import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: '*.odoo.com',
      },
      {
        protocol: 'https',
        hostname: 'biznexus.seisei.tokyo',
      },
      {
        protocol: 'https',
        hostname: '*.seisei.tokyo',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
