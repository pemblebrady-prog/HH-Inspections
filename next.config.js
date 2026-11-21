/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Only our own pages and Brian's website may show the portal in a frame (stops look-alike sites framing it).
  async headers() {
    return [{
      source: "/:path*",
      headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://houseandhomeaz.com https://www.houseandhomeaz.com" }],
    }, {
      // The offline helper must always be re-checked, so updates reach phones quickly.
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }],
    }];
  },
};
module.exports = nextConfig;
