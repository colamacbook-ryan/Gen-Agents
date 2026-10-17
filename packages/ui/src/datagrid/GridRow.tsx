// biome-ignore-all lint/a11y/useSemanticElements: lưới tương tác ARIA (APG grid) dựng bằng div — <table> không ảo hoá + sticky + roving được
// biome-ignore-all lint/a11y/useFocusableInteractive: mẫu aria-activedescendant — focus ở phần tử role=grid, hàng / ô không nhận focus (APG)
// Một hàng của lưới (memo — khi cuộn chỉ hàng mới vào màn được dựng). Mọi ô có `data-anchor` gắn display_id thật (STD-08 §1).
// Ô bool = công tắc inline, ô enum = dropdown khi sửa; ô dài hiện dòng đầu + badge token (STD-07 §5 mục 4).
import { type KeyboardEvent, type MouseEvent, memo, useEffect, useRef } from 'react';
import { anchorOf, displayText, isEditable } from './columns.ts';
import { IconChevron } from './icons.tsx';
import type { GridLabels } from './labels.ts';
import type { EntityTable, GridColumn, GridRowMeta } from './types.ts';

export interface RowColumn<R> {
  col: GridColumn<R>;
  letter: string;
}

export type MoveAfterEdit = 'down' | 'right' | 'left' | 'none';

export interface EditState {
  v: number;
  col: string;
  draft: string;
  saving: boolean;
}

export interface RowActions<R> {
  toggleChecked(id: string): void;
  toggleBool(v: number, colId: string): void;
  setDraft(draft: string): void;
  commitEdit(move: MoveAfterEdit): void;
  cancelEdit(): void;
  apply(row: R): void;
  reject(row: R): void;
  goto(id: string): void;
  toggleGroup(group: number): void;
  focusGrid(): void;
}

/** id cột "Duyệt" (đề xuất / bị thay) — không phải cột DB, không có chữ cột */
export const META_COL = '__meta';

/** DOM id của ô (aria-activedescendant) */
export const cellDomId = (domId: string, id: string, letter: string): string => `${domId}-${id}-${letter}`;
export const groupDomId = (domId: string, group: number): string => `${domId}-g${group}`;
export const metaDomId = (domId: string, id: string): string => `${domId}-${id}-meta`;

const keepFocus = (e: MouseEvent): void => e.preventDefault(); // nút trong ô không lấy focus khỏi lưới (một tab stop)

/**
 * Phím trong nút của ô "Duyệt" (APG: Enter trên ô đưa focus vào widget của ô): ←/→ chuyển giữa các nút cùng ô,
 * Esc trả focus về lưới. Enter / Space là kích hoạt gốc của <button>.
 */
const metaKey =
  <R,>(actions: RowActions<R>) =>
  (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      actions.focusGrid();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const sib = e.key === 'ArrowRight' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      if (sib instanceof HTMLButtonElement) sib.focus();
    }
  };

function CellEditor<R>(props: {
  col: GridColumn<R>;
  id: string;
  edit: EditState;
  labels: GridLabels;
  actions: RowActions<R>;
}) {
  const { col, edit, actions } = props;
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (ref.current instanceof HTMLInputElement) ref.current.select();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      actions.commitEdit('down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      actions.commitEdit(e.shiftKey ? 'left' : 'right');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      actions.cancelEdit();
    }
  };
  const label = `${col.header} · ${props.id}`;
  if (col.kind === 'enum' && col.options) {
    return (
      <select
        ref={ref}
        className="ga-dg-editor"
        aria-label={label}
        value={edit.draft}
        disabled={edit.saving}
        onChange={(e) => actions.setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => actions.commitEdit('none')}
      >
        {col.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      ref={ref}
      className="ga-dg-editor"
      type="text"
      aria-label={label}
      inputMode={col.kind === 'number' ? 'decimal' : undefined}
      spellCheck={false}
      value={edit.draft}
      readOnly={edit.saving}
      onChange={(e) => actions.setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => actions.commitEdit('none')}
    />
  );
}

function CellContent<R>(props: {
  col: GridColumn<R>;
  row: R;
  id: string;
  v: number;
  editable: boolean;
  labels: GridLabels;
  actions: RowActions<R>;
  fmtNum: (n: number) => string;
}) {
  const { col, row, labels } = props;
  if (col.kind === 'bool') {
    const on = col.value(row) === true;
    return (
      <button
        type="button"
        role="switch"
        className="ga-dg-switch"
        tabIndex={-1}
        aria-checked={on}
        aria-label={`${col.header} · ${props.id}: ${on ? labels.on : labels.off}`}
        aria-disabled={!props.editable}
        onMouseDown={keepFocus}
        onClick={() => {
          if (props.editable) props.actions.toggleBool(props.v, col.id);
        }}
      />
    );
  }
  const text = displayText(col, row);
  if (col.kind === 'longtext') {
    const tokens = col.tokens?.(row);
    return (
      <>
        <span className="ga-dg-text">{text.split('\n', 1)[0]}</span>
        {tokens != null && <span className="ga-dg-tok">{props.fmtNum(tokens)}</span>}
      </>
    );
  }
  if (col.kind === 'number' && typeof col.value(row) === 'number' && !col.format) {
    return <span className="ga-dg-text">{props.fmtNum(col.value(row) as number)}</span>;
  }
  return <span className="ga-dg-text">{text}</span>;
}

export interface GridRowProps<R> {
  v: number;
  ariaRow: number;
  row: R | undefined;
  id: string | undefined;
  cols: readonly RowColumn<R>[];
  table: EntityTable;
  domId: string;
  activeCol: string | null;
  checked: boolean;
  edit: EditState | null;
  meta: GridRowMeta | null;
  hasMeta: boolean;
  canEdit: boolean;
  canApply: boolean;
  canReject: boolean;
  labels: GridLabels;
  actions: RowActions<R>;
  fmtNum: (n: number) => string;
}

function GridRowInner<R>(p: GridRowProps<R>) {
  const { row, id, cols, labels, v } = p;
  if (row === undefined || id === undefined) {
    return (
      <div role="row" aria-rowindex={p.ariaRow} className="ga-dg-row" aria-busy="true">
        <div role="gridcell" className="ga-dg-fz0" aria-colindex={1} />
        <div role="rowheader" className="ga-dg-fz1 ga-dg-id" aria-colindex={2}>
          <span className="ga-dg-skel" />
        </div>
        {cols.map((c, i) => (
          <div role="gridcell" key={c.col.id} className="ga-dg-cell" aria-colindex={i + 3}>
            <span className="ga-dg-skel" />
          </div>
        ))}
        {p.hasMeta && <div role="gridcell" className="ga-dg-meta" aria-colindex={cols.length + 3} />}
      </div>
    );
  }
  const kind = p.meta?.kind ?? 'normal';
  return (
    <div
      role="row"
      aria-rowindex={p.ariaRow}
      className="ga-dg-row"
      data-anchor={anchorOf(p.table, id)}
      data-kind={kind === 'normal' ? undefined : kind}
      data-active={p.activeCol ? '' : undefined}
      aria-selected={p.checked}
    >
      <div role="gridcell" className="ga-dg-fz0" aria-colindex={1}>
        <input
          type="checkbox"
          className="ga-dg-check"
          tabIndex={-1}
          checked={p.checked}
          aria-label={labels.selectRow(id)}
          onMouseDown={keepFocus}
          onChange={() => p.actions.toggleChecked(id)}
        />
      </div>
      <div role="rowheader" className="ga-dg-fz1 ga-dg-id" aria-colindex={2}>
        {kind === 'proposed' && <span className="ga-dg-dot" aria-hidden="true" />}
        {id}
      </div>
      {cols.map((c, i) => {
        const active = p.activeCol === c.col.id;
        const editable = p.canEdit && isEditable(c.col, row);
        const editing = p.edit !== null && p.edit.col === c.col.id;
        return (
          <div
            role="gridcell"
            key={c.col.id}
            id={cellDomId(p.domId, id, c.letter)}
            className="ga-dg-cell"
            data-v={v}
            data-col={c.col.id}
            data-anchor={anchorOf(p.table, id, c.letter)}
            aria-colindex={i + 3}
            aria-selected={active}
            aria-readonly={!editable}
            data-active={active ? '' : undefined}
            data-align={c.col.align}
            data-mono={c.col.kind === 'date' || c.col.kind === 'id' ? '' : undefined}
          >
            {editing && p.edit ? (
              <CellEditor col={c.col} id={id} edit={p.edit} labels={labels} actions={p.actions} />
            ) : (
              <CellContent
                col={c.col}
                row={row}
                id={id}
                v={v}
                editable={editable}
                labels={labels}
                actions={p.actions}
                fmtNum={p.fmtNum}
              />
            )}
          </div>
        );
      })}
      {p.hasMeta && (
        <div
          role="gridcell"
          id={metaDomId(p.domId, id)}
          className="ga-dg-meta"
          aria-colindex={cols.length + 3}
          aria-selected={p.activeCol === META_COL}
          data-v={v}
          data-col={META_COL}
          data-active={p.activeCol === META_COL ? '' : undefined}
        >
          {kind === 'proposed' && (
            <>
              <span className="ga-dg-badge">{labels.proposed}</span>
              {p.canApply && (
                <button
                  type="button"
                  className="ga-dg-mini ga-dg-mini-ok"
                  tabIndex={-1}
                  onKeyDown={metaKey(p.actions)}
                  onClick={() => p.actions.apply(row)}
                >
                  {labels.apply}
                </button>
              )}
              {p.canReject && (
                <button
                  type="button"
                  className="ga-dg-mini"
                  tabIndex={-1}
                  onKeyDown={metaKey(p.actions)}
                  onClick={() => p.actions.reject(row)}
                >
                  {labels.reject}
                </button>
              )}
            </>
          )}
          {kind === 'superseded' && p.meta?.supersededBy && (
            <button
              type="button"
              className="ga-dg-link"
              tabIndex={-1}
              onKeyDown={metaKey(p.actions)}
              onClick={() => p.actions.goto(p.meta?.supersededBy as string)}
            >
              {labels.supersededBy(p.meta.supersededBy)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const GridRow = memo(GridRowInner) as typeof GridRowInner;

export interface GroupRowProps {
  v: number;
  ariaRow: number;
  group: number;
  open: boolean;
  text: string;
  active: boolean;
  colCount: number;
  domId: string;
  onToggle: (group: number) => void;
}

export const GroupRow = memo(function GroupRow(p: GroupRowProps) {
  return (
    <div role="row" aria-rowindex={p.ariaRow} className="ga-dg-row" data-group="">
      <div
        role="gridcell"
        id={groupDomId(p.domId, p.group)}
        className="ga-dg-grouprow"
        aria-colspan={p.colCount}
        aria-colindex={1}
        data-v={p.v}
        data-active={p.active ? '' : undefined}
      >
        <button
          type="button"
          className="ga-dg-gtoggle"
          tabIndex={-1}
          aria-expanded={p.open}
          aria-label={p.text}
          onMouseDown={keepFocus}
          onClick={() => p.onToggle(p.group)}
        >
          <IconChevron open={p.open} />
        </button>
        <span>{p.text}</span>
      </div>
    </div>
  );
});
