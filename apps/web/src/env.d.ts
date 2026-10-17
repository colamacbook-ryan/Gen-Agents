/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** version của app (package.json), do vite.config.ts định nghĩa lúc build */
  readonly VITE_GA_VERSION?: string;
  /** bật trang bộ component (/__ui-kit) ở bản build (mặc định chỉ bật ở dev) */
  readonly VITE_GA_UIKIT?: string;
}
