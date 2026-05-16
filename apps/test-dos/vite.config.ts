import { defineConfig } from 'vite';

export default defineConfig({
  base: '/apps/test-dos/',
  server: { port: 8085, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
