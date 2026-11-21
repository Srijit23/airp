import { defineConfig } from 'vite';
import { cityPlugin } from './scripts/city-assets.js';

export default defineConfig({
  base: './',
  plugins: [cityPlugin()],
  build: {
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
    chunkSizeWarningLimit: 650,
  },
});
