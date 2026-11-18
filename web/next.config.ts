import type { NextConfig } from "next";

// Dev convenience: same-origin API so the HttpOnly cookie works without Caddy. WebSockets (/ws/*) and /play need Caddy (docker compose).
const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Tailwind v4 CSS pipeline for Turbopack (scaffold default; do not remove)
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
