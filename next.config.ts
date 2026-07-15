import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/recover-password", destination: "/login?mode=recover", permanent: false },
      { source: "/reset-password", destination: "/login?mode=reset", permanent: false },
    ];
  },
};

export default nextConfig;
