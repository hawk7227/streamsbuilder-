/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@streams/contracts",
    "@streams/core",
    "@streams/ai",
    "@streams/ui",
    "@streams/system-status",
  ],
};

export default nextConfig;
