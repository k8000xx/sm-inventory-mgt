/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['exceljs'],
  experimental: {
    serverActions: {
      // Inventory spreadsheets routinely run to thousands of rows.
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;
