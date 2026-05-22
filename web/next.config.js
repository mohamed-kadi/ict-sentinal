/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lightweight-charts'],
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
      },
    ],
  },
};

module.exports = nextConfig;
