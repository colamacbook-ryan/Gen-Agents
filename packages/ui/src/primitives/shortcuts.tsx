// Phím tắt toàn cục (FRONTEND-SPEC §2.4, STD-07 §10). Đăng ký bằng `useShortcut`; một listener duy nhất ở `document`.
//   - cú pháp: `mod+k` (⌘ hoặc Ctrl), `alt+p`, `mod+enter`, `?`, `[`, hoặc chuỗi hai bước `g d` (cửa sổ 1,2 giây)
//   - phím chữ trơn (j, k, n, /, g…) bị bỏ qua khi đang gõ trong ô nhập; tổ hợp có mod thì vẫn chạy
//   - `disabled` (chế độ khắc phục O4): tắt mọi phím tắt toàn cục
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

export interface ShortcutDef {
  id: string;
  /** vd 'mod+k' · 'g d' · '?' · '[' · 'mod+enter' */
  keys: string;
  run(event: KeyboardEvent): void;
  /** chạy cả khi đang gõ trong ô nhập (mặc định: chỉ với tổ hợp có mod) */
  allowInInput?: boolean;
  enabled?: boolean;
}

export const SEQUENCE_TIMEOUT_MS = 1200;

interface Registry {
  register(def: ShortcutDef): () => void;
  list(): ShortcutDef[];
}

const Ctx = createContext<Registry | null>(null);

const isEditable = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.getAttribute('role') === 'textbox';
};

const KEY_ALIASES: Record<string, string> = { esc: 'escape', return: 'enter', ' ': 'space' };

interface ParsedStep {
  key: string;
  mod: boolean;
  alt: boolean;
  shift: boolean;
}

/** `mod+k` → { key:'k', mod:true }. Một phím có ký hiệu (`?`) tự mang shift nên không đòi `shift` riêng. */
export function parseKeys(spec: string): ParsedStep[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((part) => {
      const bits = part.split('+');
      const key = (bits.pop() ?? '').toLowerCase();
      const mods = new Set(bits.map((b) => b.toLowerCase()));
      return { key: KEY_ALIASES[key] ?? key, mod: mods.has('mod'), alt: mods.has('alt'), shift: mods.has('shift') };
    });
}

function matchStep(e: KeyboardEvent, step: ParsedStep): boolean {
  const key = (KEY_ALIASES[e.key.toLowerCase()] ?? e.key.toLowerCase()) as string;
  if (key !== step.key) return false;
  if (step.mod !== (e.metaKey || e.ctrlKey)) return false;
  if (step.alt !== e.altKey) return false;
  // shift chỉ bị so khi bước đòi shift, hoặc phím là chữ cái (Shift+K ≠ K)
  if (step.shift !== e.shiftKey && /^[a-z0-9]$/.test(step.key)) return false;
  return true;
}

export function ShortcutProvider({ disabled = false, children }: { disabled?: boolean; children: ReactNode }) {
  const defs = useRef(new Map<string, ShortcutDef>());
  const pending = useRef<{ prefix: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const clearPending = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  useEffect(() => {
    if (disabled) {
      clearPending();
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const typing = isEditable(e.target);
      const all = [...defs.current.values()].filter((d) => d.enabled !== false);

      // bước 2 của chuỗi `g x`
      if (pending.current) {
        const prefix = pending.current.prefix;
        clearPending();
        for (const d of all) {
          const steps = parseKeys(d.keys);
          if (steps.length === 2 && (steps[0] as ParsedStep).key === prefix && matchStep(e, steps[1] as ParsedStep)) {
            e.preventDefault();
            d.run(e);
            return;
          }
        }
      }

      for (const d of all) {
        const steps = parseKeys(d.keys);
        const first = steps[0] as ParsedStep;
        if (!matchStep(e, first)) continue;
        if (typing && !d.allowInInput && !first.mod) continue;
        if (steps.length === 1) {
          e.preventDefault();
          d.run(e);
          return;
        }
        // phím đầu của chuỗi: chờ phím thứ hai
        if (typing) continue;
        e.preventDefault();
        pending.current = { prefix: first.key, timer: setTimeout(clearPending, SEQUENCE_TIMEOUT_MS) };
        return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearPending();
    };
  }, [disabled, clearPending]);

  const registry = useMemo<Registry>(
    () => ({
      register(def) {
        defs.current.set(def.id, def);
        return () => {
          if (defs.current.get(def.id) === def) defs.current.delete(def.id);
        };
      },
      list: () => [...defs.current.values()],
    }),
    [],
  );
  return <Ctx.Provider value={registry}>{children}</Ctx.Provider>;
}

/** Đăng ký một phím tắt cho đời của component. `run` luôn là bản mới nhất (không cần useCallback). */
export function useShortcut(def: ShortcutDef): void {
  const registry = useContext(Ctx);
  const latest = useRef(def);
  latest.current = def;
  const { id, keys, allowInInput, enabled } = def;
  useEffect(() => {
    if (!registry) return;
    return registry.register({
      id,
      keys,
      allowInInput,
      enabled,
      run: (e) => latest.current.run(e),
    });
  }, [registry, id, keys, allowInInput, enabled]);
}

export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

const MAC_GLYPH: Record<string, string> = { mod: '⌘', alt: '⌥', shift: '⇧', enter: '↵', escape: 'Esc', space: 'Space' };
const PC_GLYPH: Record<string, string> = {
  mod: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  enter: '↵',
  escape: 'Esc',
  space: 'Space',
};

/** `mod+k` → "⌘K" (Mac) / "Ctrl K"; `g d` → "G D"; `mod+enter` → "⌘↵". */
export function formatCombo(spec: string, mac: boolean = isMacPlatform()): string {
  const glyph = mac ? MAC_GLYPH : PC_GLYPH;
  return spec
    .trim()
    .split(/\s+/)
    .map((part) => {
      const bits = part.split('+').map((b) => b.toLowerCase());
      const out = bits.map((b) => glyph[b] ?? (b.length === 1 ? b.toUpperCase() : b));
      return mac ? out.join('') : out.join(' ');
    })
    .join(' ');
}
