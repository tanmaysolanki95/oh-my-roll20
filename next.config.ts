import type { NextConfig } from "next";

// Derive the Supabase host for CSP connect-src / img-src directives.
// Falls back to *.supabase.co when the env var is absent (e.g. CI).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "*.supabase.co";

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Disallow embedding in iframes
  { key: "X-Frame-Options", value: "DENY" },
  // Leak no referrer to third parties
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HSTS: enforce HTTPS for 2 years
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Content Security Policy
  {
    key: "Content-Security-Policy",
    value: [
      // Default deny
      "default-src 'self'",
      // Next.js requires 'unsafe-inline' for its runtime hydration scripts
      "script-src 'self' 'unsafe-inline'",
      // Inline styles are used throughout (Konva, Tailwind, theme vars)
      "style-src 'self' 'unsafe-inline'",
      // Map images may come from Supabase storage or any HTTPS source (user-uploaded URLs);
      // data: for Konva canvas export; blob: for object URLs
      `img-src 'self' https: data: blob:`,
      // Supabase REST API + WebSocket realtime
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
      // Fonts served from same origin only
      "font-src 'self'",
      // No plugin embeds
      "object-src 'none'",
      // Block <base> tag hijacking
      "base-uri 'self'",
      // Forms only post to same origin
      "form-action 'self'",
      // No nested browsing contexts
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
