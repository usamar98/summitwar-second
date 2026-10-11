import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, experimental:{cpus:1}, serverExternalPackages: ['@electric-sql/pglite','playwright-core','@sparticuz/chromium'],outputFileTracingIncludes:{'/api/cron':['./node_modules/@sparticuz/chromium/bin/**/*']}, async headers() { return [{ source: '/:path*', headers: [{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}] }]; } };
export default config;
