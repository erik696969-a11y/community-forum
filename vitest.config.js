import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Next.js appka má komponenty s JSX v súboroch s príponou .js (bežné pre
// Next.js, funguje to tam bez problémov) - Vitest/Vite ale defaultne
// očakáva JSX len v .jsx/.tsx súboroch. Toto nastavenie povie Vitestu,
// aby JSX rozpoznával aj v obyčajných .js súboroch.
export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
    loader: 'jsx',
    include: /\.jsx?$/,
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    globals: true,
  },
});
