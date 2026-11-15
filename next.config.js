/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Only our own pages and Brian's website may show the portal in a frame (stops look-alike sites framing it).
  async headers() {
    return [{
      source: "/:path*",
      headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://houseandhomeaz.com https://www.houseandhomeaz.com" }],
    }];
  },
};
module.exports = nextConfig;
