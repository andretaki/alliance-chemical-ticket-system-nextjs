/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@azure/identity', '@azure/msal-node', 'node-quickbooks', 'intuit-oauth'],
};

export default nextConfig; 