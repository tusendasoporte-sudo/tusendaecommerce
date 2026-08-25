import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

const isProductionBuild = process.env.NODE_ENV === 'production' || process.argv.includes('build');

function promoAssetInlineLimit(filePath) {
  const asset = String(filePath || '').replaceAll('\\', '/');
  if (/PromoPublicShell\.[A-Za-z0-9_-]+\.css$/.test(asset)) return true;
  if (/PromoPublicLayout\.astro_astro_type_script_.*\.js$/.test(asset)) return false;
  return undefined;
}

export default defineConfig({
  output: 'server',
  devToolbar: {
    enabled: process.env.PZ_VISUAL_TEST !== '1',
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
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
    cacheDir: '.astro/vite-cache',
    plugins: [tailwindcss()],
    build: {
      assetsInlineLimit: promoAssetInlineLimit,
      sourcemap: false,
      minify: 'esbuild',
    },
    esbuild: {
      legalComments: 'none',
      drop: isProductionBuild ? ['console', 'debugger'] : [],
    },
  },
});
