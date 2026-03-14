/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  distDir: "out",
  images: { unoptimized: true },
  // Required for Tauri — disable SSR
  trailingSlash: true,
};

module.exports = nextConfig;
