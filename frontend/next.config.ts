import type { NextConfig } from "next";
import createPWA from "next-pwa";

const pwaOptions: Parameters<typeof createPWA>[0] & { reloadOnOnline: boolean } = {
  dest: "public",
  register: true,
  skipWaiting: true,
  // next-pwa defaults to location.reload() on every "online" event, which reloads the POS shell
  // and every open iframe whenever the network flickers (and would discard an unsaved sale).
  reloadOnOnline: false,
  disable:
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_ENABLE_PWA_DEV !== "true",
};

const withPWA = createPWA(pwaOptions);

const nextConfig: NextConfig = {
  /* config options here */
};

export default withPWA(nextConfig);
