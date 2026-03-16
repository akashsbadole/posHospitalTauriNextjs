/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Tauri — disable SSR
  trailingSlash: true,
};

module.exports = nextConfig;
