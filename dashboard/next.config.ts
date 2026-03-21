import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained Node.js server at .next/standalone
  // Required for Docker / ECS Fargate deployment
  output: 'standalone',
};

export default nextConfig;
