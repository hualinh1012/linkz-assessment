/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit source maps for client bundles in production builds so browser
  // DevTools can map minified code back to the original TypeScript.
  // Dev mode already emits source maps natively — no override needed there.
  productionBrowserSourceMaps: true,
  // Prisma must be treated as an external package in Server Components / Route Handlers.
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

export default nextConfig;
