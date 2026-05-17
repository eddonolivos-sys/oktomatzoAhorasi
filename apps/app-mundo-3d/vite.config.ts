import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const CESIUM_BASE = '/apps/mundo-3d/cesium';

export default defineConfig({
  base: '/apps/mundo-3d/',
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Assets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: 'cesium' },
      ],
    }),
  ],
  define: {
    // CesiumJS reads this global at runtime to locate workers/assets
    CESIUM_BASE_URL: JSON.stringify(CESIUM_BASE),
  },
  server: {
    port: 5176,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
  },
});
