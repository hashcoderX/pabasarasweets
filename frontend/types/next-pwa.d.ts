declare module "next-pwa" {
  import type { NextConfig } from "next";

  type PWAOptions = {
    dest: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean;
  };

  const createPWA: (options: PWAOptions) => (config: NextConfig) => NextConfig;
  export default createPWA;
}
