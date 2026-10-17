/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** version của app (package.json), do vite.config.ts định nghĩa lúc build */
  readonly VITE_GA_VERSION?: string;
  /** bật trang bộ component (/__ui-kit) ở bản build (mặc định chỉ bật ở dev) */
  readonly VITE_GA_UIKIT?: string;
  /** bật kiểm request / response theo schema hợp đồng ở bản build (mặc định chỉ bật ở dev / test) */
  readonly VITE_GA_VALIDATE?: string;
  /** bật backend giả (src/api/fake) ở bản build — chỉ dùng để demo, KHÔNG bao giờ ở bản phát hành */
  readonly VITE_GA_FAKE?: string;
  /** 'contract' = đăng nhập qua /api/v1/auth/* (EXT-01…04) thay vì /api/auth/* của L-SEC; luôn dùng khi có backend giả */
  readonly VITE_GA_AUTH?: string;
}
