/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Keep development controls out of the product viewport screenshots. */
  devIndicators: false,
  // A deployment ID lets Next detect a client/server version skew and force a
  // hard reload when a user has an older document open during a rollout.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || "local",
  // The shell is a client-heavy app. Do not let a shared cache keep an old
  // HTML document that references chunks removed by the next deployment.
  // Private user media and local QA captures must not be copied into route
  // bundles through dynamic filesystem access in the upload handlers.
  outputFileTracingExcludes: {
    "/*": [
      "./.data/**/*",
      "./.playwright-cli/**/*",
      "./output/**/*",
    ],
  },
  async headers() {
    const noStore = {
      key: "Cache-Control",
      value: "no-store, max-age=0, must-revalidate",
    };
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/", headers: [noStore] },
      { source: "/login", headers: [noStore] },
      { source: "/pricing", headers: [noStore] },
      { source: "/makeover", headers: [noStore] },
      { source: "/diagnose", headers: [noStore] },
      { source: "/gallery", headers: [noStore] },
      { source: "/admin", headers: [noStore] },
    ];
  },
};

export default nextConfig;
