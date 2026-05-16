import { defineConfig } from 'vite';

export default defineConfig({
  base: '/apps/test-uno/',
  server: { port: 8084, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
