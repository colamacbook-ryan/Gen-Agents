// Toolbar 36px của DataGrid (STD-07 §5 mục 1): chọn view · ô truy vấn · Lọc, Sắp xếp, Nhóm, Cột, Mật độ, Xuất CSV · "+ Thêm hàng".
// Popover nhỏ tự dựng (L-DS sở hữu overlay chung; popover này chỉ sống trong lưới): Esc / bấm ra ngoài đóng, trả focus về nút mở.
import { type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_OPS, type QueryField, resolveQuery } from '../query-box/fields.ts';
import { joinClauses, type QueryOp } from '../query-box/parse.ts';
import { QueryBox } from '../query-box/QueryBox.tsx';
import { IconColumns, IconDensity, IconDownload, IconFilter, IconGroup, IconPlus, IconSort } from './icons.tsx';
import type { GridLabels } from './labels.ts';
import type { Density } from './persist.ts';
import type { GridColumn, GridSort, GridView } from './types.ts';

export type PopoverKind = 'filter' | 'sort' | 'group' | 'columns';

export interface ToolbarColumn<R> {
  col: GridColumn<R>;
  letter: string;
  visible: boolean;
}

export interface ToolbarProps<R> {
  labels: GridLabels;
  views: readonly GridView[];
  view: string | null;
  onView: (id: string | null) => void;
  q: string;
  onQuery: (q: string) => void;
  fields: readonly QueryField[];
  idPrefix: string;
  placeholder: string;
  queryInputRef: RefObject<HTMLInputElement | null>;
  serverQueryError: { reason: string; position: number | null } | null;
  columns: readonly ToolbarColumn<R>[];
  sort: readonly GridSort[];
  onSort: (sort: GridSort[]) => void;
  groupBy: string | null;
  canGroup: boolean;
  onGroupBy: (col: string | null) => void;
  onToggleColumn: (id: string, visible: boolean) => void;
  density: Density;
  onDensity: (d: Density) => void;
  exporting: boolean;
  onExport: () => void;
  canAdd: boolean;
  onAdd: () => void;
}

function Popover(props: {
  label: string;
  open: boolean;
  anchor: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { open, onClose, anchor } = props;
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    el?.querySelector<HTMLElement>('select, input, button')?.focus();
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (el?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose, anchor]);
  // neo mép phải popover vào mép phải nút mở (nút nằm bên phải toolbar) ⇒ không tràn khỏi panel (panel overflow: hidden);
  // vị trí là biến CSS đặt bằng CSSOM trước khi vẽ (không style nội tuyến)
  useLayoutEffect(() => {
    const el = ref.current;
    const a = anchor.current;
    const bar = a?.offsetParent as HTMLElement | null | undefined;
    if (!el || !a || !bar) return;
    el.style.setProperty('--ga-dg-pop-right', `${Math.max(0, bar.clientWidth - (a.offsetLeft + a.offsetWidth))}px`);
  });
  if (!open) return null;
  return (
    <div
      ref={ref}
      className="ga-dg-pop"
      role="dialog"
      aria-label={props.label}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          anchor.current?.focus();
        }
      }}
    >
      <div className="ga-dg-pop-title">{props.label}</div>
      {props.children}
    </div>
  );
}

const quote = (v: string): string | null => {
  if (v.includes('"')) return null;
  return /[\s,]|\.\./.test(v) || v === '' ? `"${v}"` : v;
};

function FilterPanel<R>(props: ToolbarProps<R> & { onDone: () => void }) {
  const { labels, columns, fields } = props;
  const queryable = columns.filter((c) => c.col.query !== false);
  const [colId, setColId] = useState(queryable[0]?.col.id ?? '');
  const col = queryable.find((c) => c.col.id === colId)?.col;
  const field = col ? fields.find((f) => f.name === (col.query ? col.query.field : col.id)) : undefined;
  const ops: readonly QueryOp[] = field ? (field.ops ?? DEFAULT_OPS[field.type]) : [':'];
  const [op, setOp] = useState<QueryOp>(':');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ids = { col: useId(), op: useId(), val: useId(), err: useId() };
  const effectiveOp = ops.includes(op) ? op : (ops[0] ?? ':');

  const add = (): void => {
    if (!field) return;
    const v = quote(value.trim());
    if (v === null) {
      setError(labels.invalidValue);
      return;
    }
    const next = joinClauses([props.q, `${field.name}${effectiveOp}${v}`]);
    const r = resolveQuery(next, fields, { idPrefix: props.idPrefix });
    if (!r.ok) {
      setError(labels.query.error(r.error.reason, next.slice(r.error.position, r.error.position + r.error.length)));
      return;
    }
    props.onQuery(next);
    props.onDone();
  };

  return (
    <>
      <div className="ga-dg-pop-row">
        <label htmlFor={ids.col}>{labels.filterColumn}</label>
        <select
          id={ids.col}
          value={colId}
          onChange={(e) => {
            setColId(e.target.value);
            setValue('');
            setError(null);
          }}
        >
          {queryable.map((c) => (
            <option key={c.col.id} value={c.col.id}>
              {c.letter} · {c.col.header}
            </option>
          ))}
        </select>
      </div>
      <div className="ga-dg-pop-row">
        <label htmlFor={ids.op}>{labels.filterOp}</label>
        <select id={ids.op} value={effectiveOp} onChange={(e) => setOp(e.target.value as QueryOp)}>
          {ops.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <div className="ga-dg-pop-row">
        <label htmlFor={ids.val}>{labels.filterValue}</label>
        {col?.options || col?.kind === 'bool' ? (
          <select id={ids.val} value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="" disabled>
              —
            </option>
            {(
              col.options ?? [
                { value: 'true', label: labels.on },
                { value: 'false', label: labels.off },
              ]
            ).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={ids.val}
            type="text"
            value={value}
            maxLength={200}
            aria-describedby={error ? ids.err : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        )}
      </div>
      {error && (
        <div id={ids.err} role="alert">
          {error}
        </div>
      )}
      <div className="ga-dg-pop-actions">
        <button type="button" className="ga-dg-btn ga-dg-btn-primary" onClick={add} disabled={!field}>
          {labels.filterAdd}
        </button>
      </div>
    </>
  );
}

function SortPanel<R>(props: ToolbarProps<R> & { onDone: () => void }) {
  const { labels, columns, sort } = props;
  const sortable = columns.filter((c) => c.col.sortable !== false);
  const first = sort[0];
  const [colId, setColId] = useState(first?.column ?? sortable[0]?.col.id ?? '');
  const [desc, setDesc] = useState(first?.desc ?? false);
  const ids = { col: useId(), dir: useId() };
  return (
    <>
      <div className="ga-dg-pop-row">
        <label htmlFor={ids.col}>{labels.filterColumn}</label>
        <select id={ids.col} value={colId} onChange={(e) => setColId(e.target.value)}>
          {sortable.map((c) => (
            <option key={c.col.id} value={c.col.id}>
              {c.letter} · {c.col.header}
            </option>
          ))}
        </select>
      </div>
      <div className="ga-dg-pop-row">
        <label htmlFor={ids.dir}>{labels.sort}</label>
        <select id={ids.dir} value={desc ? 'desc' : 'asc'} onChange={(e) => setDesc(e.target.value === 'desc')}>
          <option value="asc">{labels.sortAsc}</option>
          <option value="desc">{labels.sortDesc}</option>
        </select>
      </div>
      <div className="ga-dg-pop-actions">
        <button
          type="button"
          className="ga-dg-btn"
          disabled={sort.length === 0}
          onClick={() => {
            props.onSort([]);
            props.onDone();
          }}
        >
          {labels.sortClear}
        </button>
        <button
          type="button"
          className="ga-dg-btn ga-dg-btn-primary"
          disabled={colId === ''}
          onClick={() => {
            props.onSort([{ column: colId, desc }]);
            props.onDone();
          }}
        >
          {labels.apply2}
        </button>
      </div>
    </>
  );
}

function GroupPanel<R>(props: ToolbarProps<R> & { onDone: () => void }) {
  const { labels, columns } = props;
  const groupable = columns.filter((c) => c.col.kind === 'enum' || c.col.kind === 'bool' || c.col.kind === 'text');
  const id = useId();
  return (
    <div className="ga-dg-pop-row">
      <label htmlFor={id}>{labels.groupBy}</label>
      <select
        id={id}
        value={props.groupBy ?? ''}
        onChange={(e) => {
          props.onGroupBy(e.target.value === '' ? null : e.target.value);
          props.onDone();
        }}
      >
        <option value="">{labels.groupNone}</option>
        {groupable.map((c) => (
          <option key={c.col.id} value={c.col.id}>
            {c.letter} · {c.col.header}
          </option>
        ))}
      </select>
    </div>
  );
}

function ColumnsPanel<R>(props: ToolbarProps<R>) {
  const visibleCount = props.columns.filter((c) => c.visible).length;
  return (
    <ul className="ga-dg-pop-list">
      {props.columns.map((c) => (
        <li key={c.col.id}>
          <label>
            <input
              type="checkbox"
              className="ga-dg-check"
              checked={c.visible}
              // luôn giữ ít nhất một cột dữ liệu
              disabled={c.visible && visibleCount === 1}
              onChange={(e) => props.onToggleColumn(c.col.id, e.target.checked)}
            />
            <span className="ga-dg-letter">{c.letter}</span>
            {c.col.header}
          </label>
        </li>
      ))}
    </ul>
  );
}

export function Toolbar<R>(props: ToolbarProps<R>) {
  const { labels } = props;
  const [pop, setPop] = useState<PopoverKind | null>(null);
  const refs = {
    filter: useRef<HTMLButtonElement>(null),
    sort: useRef<HTMLButtonElement>(null),
    group: useRef<HTMLButtonElement>(null),
    columns: useRef<HTMLButtonElement>(null),
  };
  const viewId = useId();
  const close = useRef(() => setPop(null)).current;
  const done = (kind: PopoverKind) => () => {
    setPop(null);
    refs[kind].current?.focus();
  };
  const toggle = (kind: PopoverKind) => () => setPop((p) => (p === kind ? null : kind));
  const iconButton = (kind: PopoverKind, label: string, icon: ReactNode, disabled = false) => (
    <button
      ref={refs[kind]}
      type="button"
      className="ga-dg-ib"
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      aria-expanded={pop === kind}
      disabled={disabled}
      onClick={toggle(kind)}
    >
      {icon}
    </button>
  );
  return (
    <div className="ga-dg-toolbar">
      <label className="ga-dg-view-label" htmlFor={viewId}>
        {labels.view}:
      </label>
      <select
        id={viewId}
        className="ga-dg-view"
        value={props.view ?? ''}
        onChange={(e) => props.onView(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">{labels.viewAll}</option>
        {props.views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      <QueryBox
        value={props.q}
        fields={props.fields}
        idPrefix={props.idPrefix}
        onChange={props.onQuery}
        placeholder={props.placeholder}
        labels={labels.query}
        inputRef={props.queryInputRef}
        serverError={props.serverQueryError}
      />
      <div className="ga-dg-icons">
        {iconButton('filter', labels.filter, <IconFilter />)}
        {iconButton('sort', labels.sort, <IconSort />)}
        {iconButton('group', labels.group, <IconGroup />, !props.canGroup)}
        {iconButton('columns', labels.columns, <IconColumns />)}
        <button
          type="button"
          className="ga-dg-ib"
          aria-label={labels.density}
          title={props.density === 'compact' ? labels.densityComfortable : labels.densityCompact}
          aria-pressed={props.density === 'comfortable'}
          onClick={() => props.onDensity(props.density === 'compact' ? 'comfortable' : 'compact')}
        >
          <IconDensity />
        </button>
        <button
          type="button"
          className="ga-dg-ib"
          aria-label={props.exporting ? labels.exporting : labels.exportCsv}
          title={labels.exportCsv}
          aria-busy={props.exporting}
          disabled={props.exporting}
          onClick={props.onExport}
        >
          <IconDownload />
        </button>
      </div>
      {props.canAdd && (
        <button type="button" className="ga-dg-btn ga-dg-btn-primary" onClick={props.onAdd}>
          <IconPlus />
          {labels.addRow}
        </button>
      )}
      <Popover label={labels.filter} open={pop === 'filter'} anchor={refs.filter} onClose={close}>
        <FilterPanel {...props} onDone={done('filter')} />
      </Popover>
      <Popover label={labels.sort} open={pop === 'sort'} anchor={refs.sort} onClose={close}>
        <SortPanel {...props} onDone={done('sort')} />
      </Popover>
      <Popover label={labels.group} open={pop === 'group'} anchor={refs.group} onClose={close}>
        <GroupPanel {...props} onDone={done('group')} />
      </Popover>
      <Popover label={labels.columns} open={pop === 'columns'} anchor={refs.columns} onClose={close}>
        <ColumnsPanel {...props} />
      </Popover>
    </div>
  );
}
