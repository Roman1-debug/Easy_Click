import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.redditinc.com" },
      { protocol: "https", hostname: "www.reddit.com" },
      { protocol: "https", hostname: "www.redditstatic.com" },
      { protocol: "https", hostname: "cdn-icons-png.flaticon.com" },
      { protocol: "https", hostname: "www.thebetterindia.com" },
      { protocol: "https", hostname: "www.glassdoor.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
