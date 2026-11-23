/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "static" (mock data, default) or "dynamic" (OneStock API + Vercel database). */
  readonly VITE_DATA_MODE?: 'static' | 'dynamic';
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
