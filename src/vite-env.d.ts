/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_ARC_AUDIO_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
