/** @type {import('next').NextConfig} */
// Hosted deployments must declare their environment at build time. Keeping
// this check in Next's config makes the rule global for every route and page.
if (process.env.VERCEL && !process.env.APP_ENV) {
  throw new Error('APP_ENV must be explicitly configured on hosted deployments')
}
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig = {
  // Keep Next's AI-agent guidance files out of the application source tree;
  // repository instructions are managed explicitly in version control.
  agentRules: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
