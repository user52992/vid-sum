import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: () => [{ source: "/", destination: "/en", permanent: true }],
};

export default nextConfig;
