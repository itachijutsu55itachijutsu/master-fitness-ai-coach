import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ✅ FIX: Required for Vercel deployment with Convex.
  // Without this, Next.js tries to bundle Convex server-side modules
  // and fails during the Vercel build with "Module not found" errors.
  serverExternalPackages: ["convex"],

  // ✅ FIX: Suppress the "punycode" deprecation warning that appears
  // in Next.js 15 builds and can cause confusing build output.
  experimental: {
    serverComponentsExternalPackages: ["@google/generative-ai"],
  },
};

export default nextConfig;
