import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Chronicle PDF renderer runs in Node route handlers; don't bundle it.
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default nextConfig;
