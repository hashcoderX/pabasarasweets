import type { NextConfig } from "next";
import createPWA from "next-pwa";

const withPWA = createPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withPWA(nextConfig);
