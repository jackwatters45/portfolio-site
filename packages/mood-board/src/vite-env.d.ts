/// <reference types="vite/client" />

interface ViteTypeOptions {
  readonly strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_RPC_TRANSPORT?: "http" | "websocket";
  readonly VITE_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
