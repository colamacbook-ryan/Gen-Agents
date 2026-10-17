// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatCombo,
  parseKeys,
  SEQUENCE_TIMEOUT_MS,
  ShortcutProvider,
  useShortcut,
} from '../src/primitives/shortcuts.tsx';
import { h, registerCleanup } from './support/dom.ts';

registerCleanup();

function Probe(props: { keys: string; run(): void; allowInInput?: boolean; enabled?: boolean; id?: string }) {
  useShortcut({
    id: props.id ?? props.keys,
    keys: props.keys,
    run: props.run,
    allowInInput: props.allowInInput,
    enabled: props.enabled,
  });
  return h('input', { 'data-testid': 'field' });
}

const press = (init: KeyboardEventInit, target: Element = document.body): void => {
  fireEvent.keyDown(target, init);
};

describe('parseKeys / formatCombo', () => {
  it('đọc tổ hợp và chuỗi hai bước', () => {
    expect(parseKeys('mod+k')).toEqual([{ key: 'k', mod: true, alt: false, shift: false }]);
    expect(parseKeys('g d').map((s) => s.key)).toEqual(['g', 'd']);
    expect(parseKeys('Alt+P')[0]).toMatchObject({ key: 'p', alt: true });
    expect(parseKeys('mod+esc')[0]?.key).toBe('escape');
  });

  it('hiển thị theo nền tảng: ⌘ trên Mac, Ctrl trên PC', () => {
    expect(formatCombo('mod+k', true)).toBe('⌘K');
    expect(formatCombo('mod+k', false)).toBe('Ctrl K');
    expect(formatCombo('mod+enter', true)).toBe('⌘↵');
    expect(formatCombo('g d', true)).toBe('G D');
    expect(formatCombo('alt+p', true)).toBe('⌥P');
    expect(formatCombo('?', false)).toBe('?');
  });
});

describe('ShortcutProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('⌘K và Ctrl K đều chạy; phím trơn không bị coi là ⌘K', () => {
    const run = vi.fn();
    render(h(ShortcutProvider, null, h(Probe, { keys: 'mod+k', run })));
    press({ key: 'k', metaKey: true });
    press({ key: 'k', ctrlKey: true });
    expect(run).toHaveBeenCalledTimes(2);
    press({ key: 'k' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('chuỗi `g d`: hai phím liên tiếp chạy; quá cửa sổ thời gian thì huỷ', () => {
    const run = vi.fn();
    render(h(ShortcutProvider, null, h(Probe, { keys: 'g d', run })));
    press({ key: 'g' });
    press({ key: 'd' });
    expect(run).toHaveBeenCalledOnce();
    press({ key: 'g' });
    vi.advanceTimersByTime(SEQUENCE_TIMEOUT_MS + 50);
    press({ key: 'd' });
    expect(run).toHaveBeenCalledOnce();
    // phím sai ở bước hai cũng huỷ chuỗi
    press({ key: 'g' });
    press({ key: 'x' });
    press({ key: 'd' });
    expect(run).toHaveBeenCalledOnce();
  });

  it('phím chữ trơn bị bỏ qua khi đang gõ trong ô nhập; tổ hợp có mod thì vẫn chạy', () => {
    const plain = vi.fn();
    const withMod = vi.fn();
    const seq = vi.fn();
    const { getAllByTestId } = render(
      h(
        ShortcutProvider,
        null,
        h(
          'div',
          null,
          h(Probe, { keys: 'j', run: plain }),
          h(Probe, { keys: 'mod+k', run: withMod }),
          h(Probe, { keys: 'g d', run: seq }),
        ),
      ),
    );
    const field = getAllByTestId('field')[0] as HTMLInputElement;
    field.focus();
    press({ key: 'j' }, field);
    press({ key: 'g' }, field);
    press({ key: 'd' }, field);
    expect(plain).not.toHaveBeenCalled();
    expect(seq).not.toHaveBeenCalled();
    press({ key: 'k', ctrlKey: true }, field);
    expect(withMod).toHaveBeenCalledOnce();
  });

  it('allowInInput cho phép chạy khi đang gõ', () => {
    const run = vi.fn();
    const { getByTestId } = render(h(ShortcutProvider, null, h(Probe, { keys: '/', run, allowInInput: true })));
    press({ key: '/' }, getByTestId('field'));
    expect(run).toHaveBeenCalledOnce();
  });

  it('`?`, `[`, `]` và Alt+P', () => {
    const q = vi.fn();
    const prev = vi.fn();
    const pin = vi.fn();
    render(
      h(
        ShortcutProvider,
        null,
        h(
          'div',
          null,
          h(Probe, { keys: '?', run: q }),
          h(Probe, { keys: '[', run: prev }),
          h(Probe, { keys: 'alt+p', run: pin }),
        ),
      ),
    );
    press({ key: '?', shiftKey: true });
    press({ key: '[' });
    press({ key: 'p', altKey: true });
    expect([q, prev, pin].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('disabled (chế độ khắc phục O4) tắt mọi phím tắt; bật lại thì chạy', () => {
    const run = vi.fn();
    const { rerender } = render(h(ShortcutProvider, { disabled: true }, h(Probe, { keys: 'mod+k', run })));
    press({ key: 'k', metaKey: true });
    expect(run).not.toHaveBeenCalled();
    rerender(h(ShortcutProvider, { disabled: false }, h(Probe, { keys: 'mod+k', run })));
    press({ key: 'k', metaKey: true });
    expect(run).toHaveBeenCalledOnce();
  });

  it('huỷ đăng ký khi component gỡ; enabled=false thì không chạy', () => {
    const run = vi.fn();
    const { rerender } = render(h(ShortcutProvider, null, h(Probe, { keys: 'n', run })));
    rerender(h(ShortcutProvider, null, h('div')));
    press({ key: 'n' });
    expect(run).not.toHaveBeenCalled();
    rerender(h(ShortcutProvider, null, h(Probe, { keys: 'n', run, enabled: false })));
    press({ key: 'n' });
    expect(run).not.toHaveBeenCalled();
  });

  it('run luôn là bản mới nhất, không cần đăng ký lại', () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = render(h(ShortcutProvider, null, h(Probe, { keys: 'n', run: a })));
    rerender(h(ShortcutProvider, null, h(Probe, { keys: 'n', run: b })));
    press({ key: 'n' });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });
});
