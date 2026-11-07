import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // @ts-ignore - added to bypass CORS issues on the specified dev IP
  allowedDevOrigins: ['172.16.33.173'],
};

export default nextConfig;