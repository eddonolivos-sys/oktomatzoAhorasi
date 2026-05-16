import { defineConfig } from 'vite';

export default defineConfig({
  base: '/apps/viewer-3d/',
  server: {
    port: 5175,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
