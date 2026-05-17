/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN: string;
  readonly VITE_MAP_SERVICE_URL?: string;
  readonly VITE_MODEL_CAR_URL?: string;
  readonly VITE_MODEL_PLANE_URL?: string;
  readonly VITE_MODEL_BOAT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
