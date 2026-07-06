import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Next 16 only allows quality 75 by default; the navbar badge uses 100.
    qualities: [75, 100],
  },
};

export default nextConfig;
