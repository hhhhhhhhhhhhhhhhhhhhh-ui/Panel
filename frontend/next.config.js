/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3001/api/:path*', // Proxy to local Express port
      },
      // Proxy socket.io handshakes
      {
        source: '/socket.io/:path*',
        destination: 'http://127.0.0.1:3001/socket.io/:path*',
      },
      {
        source: '/fb-realtime/:path*',
        destination: 'http://127.0.0.1:3001/fb-realtime/:path*',
      },
      {
        source: '/diagnostics/:path*',
        destination: 'http://127.0.0.1:3001/diagnostics/:path*',
      },
      {
        source: '/api/telegram-webview/:path*',
        destination: 'http://127.0.0.1:3001/api/telegram-webview/:path*',
      }
    ];
  },
};

module.exports = nextConfig;
