// Plugin Vite (CHỈ dev server) để dev server chạy được dưới CSP chặt `style-src 'self'`.
//
// Vì sao cần: client của Vite (/@vite/client) nạp CSS mà JS import bằng cách tạo thẻ <style> có textContent — Chromium chặn
// (style-src-elem, không có nonce). Bản build không bị: CSS thành tệp .css + <link>. Plugin này viết lại mọi module CSS của dev:
// thay `updateStyle` / `removeStyle` của Vite bằng bản dùng constructable stylesheet (`new CSSStyleSheet()` + `replaceSync`, gắn
// bằng `adoptedStyleSheets`) — đường này không bị style-src chặn (cùng cách @ga/chibi dựng CSS của avatar). HMR vẫn chạy:
// module CSS được nạp lại thì `replaceSync` đè nội dung cũ. Không nới CSP, không nonce.
import type { Plugin } from 'vite';

const VIRTUAL = 'virtual:ga-csp-safe-styles';
const RESOLVED = `\0${VIRTUAL}`;

const RUNTIME = `
const sheets = new Map();
export function updateStyle(id, css) {
  let sheet = sheets.get(id);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheets.set(id, sheet);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  sheet.replaceSync(css);
}
export function removeStyle(id) {
  const sheet = sheets.get(id);
  if (!sheet) return;
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
  sheets.delete(id);
}
`;

const CLIENT_IMPORT = /from\s*"\/@vite\/client"/;

export function cspSafeDevStyles(): Plugin {
  return {
    name: 'ga:csp-safe-dev-styles',
    apply: 'serve',
    enforce: 'post',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      return id === RESOLVED ? RUNTIME : null;
    },
    transform(code, id) {
      // chỉ module CSS do JS import (không phải ?url / ?inline / ?raw / ?direct)
      if (!/\.css(?:\?|$)/.test(id) || /[?&](?:direct|url|inline|raw)\b/.test(id)) return null;
      if (!CLIENT_IMPORT.test(code) || !code.includes('updateStyle')) return null;
      return { code: code.replace(CLIENT_IMPORT, `from "${VIRTUAL}"`), map: null };
    },
  };
}
