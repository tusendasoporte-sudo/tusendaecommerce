import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

const isProductionBuild = process.env.NODE_ENV === 'production' || process.argv.includes('build');

export default defineConfig({
  output: 'server',
  security: {
    checkOrigin: true,
    allowedDomains: [
      { protocol: 'https', hostname: 'tusenda84.com' },
      { protocol: 'https', hostname: 'www.tusenda84.com' },
      { protocol: 'https', hostname: 'mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io' },
      { protocol: 'https', hostname: '*.91.99.99.83.sslip.io' },
    ],
  },
  adapter: node({
    mode: 'standalone',
  }),
  vite: {
    plugins: [tailwindcss()],
    build: {
      sourcemap: false,
      minify: 'esbuild',
    },
    esbuild: {
      legalComments: 'none',
      drop: isProductionBuild ? ['console', 'debugger'] : [],
    },
  },
});
