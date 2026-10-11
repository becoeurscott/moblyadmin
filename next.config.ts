import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "a0.muscache.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
};

export default config;
