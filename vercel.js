const rawBackendUrl = process.env.RENDER_BACKEND_URL;

if (!rawBackendUrl) {
  throw new Error('Set RENDER_BACKEND_URL in Vercel before deploying.');
}

let backend;
try {
  backend = new URL(rawBackendUrl);
} catch {
  throw new Error('RENDER_BACKEND_URL must be a valid HTTPS URL.');
}

if (backend.protocol !== 'https:' || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) {
  throw new Error('RENDER_BACKEND_URL must be an HTTPS origin such as https://service.onrender.com.');
}

const backendOrigin = backend.origin;

export const config = {
  buildCommand: null,
  outputDirectory: 'public',
  rewrites: [
    {
      source: '/api/:path*',
      destination: `${backendOrigin}/api/:path*`,
    },
    {
      source: '/:path*',
      destination: '/index.html',
    },
  ],
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};
