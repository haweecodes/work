/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API — e.g. https://api.yourdomain.com */
  readonly VITE_API_URL: string;
  /** Base URL for the WebSocket server (usually the same as VITE_API_URL) */
  readonly VITE_SOCKET_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
