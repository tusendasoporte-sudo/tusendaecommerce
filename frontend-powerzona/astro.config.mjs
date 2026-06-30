import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

const isProductionBuild = process.env.NODE_ENV === 'production' || process.argv.includes('build');

export default defineConfig({
  output: 'server',
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
