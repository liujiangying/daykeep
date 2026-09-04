/// <reference types="@dcloudio/types" />
/// <reference types="vite/client" />
/// <reference path="./types/lunar-javascript.d.ts" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_MOBILE_API_BASE?: string
  readonly VITE_API_PROXY_TARGET?: string
  readonly VITE_DEV_HOST?: string
  readonly VITE_DEV_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
