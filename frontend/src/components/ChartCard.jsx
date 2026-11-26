import { useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { cn } from '../utils/cn.js';

// Validated categorical order (see README > Design system). Fixed order, never cycled.
export const SERIES = { pine: '#1f8a6a', cobalt: '#3d63d4', marigold: '#c98a1a', brick: '#c2473a', neutral: '#a3a39c' };
export const AXIS = { stroke: '#dededa', tick: { fill: '#75756f', fontSize: 11 } };

export function Legend({ items }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-xs text-ink-600">
          <span className={cn('inline-block', i.line ? 'h-0.5 w-3' : 'h-2.5 w-2.5 rounded-sm')} style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Chart container with a "view as table" toggle so values are never colour-only. */
export function ChartCard({ title, description, legend, table, children, className, empty }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cn('card flex flex-col', className)}>
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          {description && <p className="text-xs text-ink-500">{description}</p>}
        </div>
        {table && (
          <button type="button" onClick={() => setAsTable((v) => !v)} className="rounded p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            aria-pressed={asTable} aria-label={asTable ? `Show ${title} as chart` : `Show ${title} as table`} title={asTable ? 'Show chart' : 'Show table'}>
            {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </header>
      {legend && !asTable && <div className="px-4 pt-2">{legend}</div>}
      <div className="flex-1 px-2 pb-3 pt-2">
        {empty ? (
          <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-ink-400">{empty}</div>
        ) : asTable ? (
          <div className="scroll-thin max-h-[260px] overflow-auto px-2">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white"><tr>{table.columns.map((c) => <th key={c} scope="col" className="border-b border-ink-150 py-1.5 pr-3 text-left font-medium text-ink-500">{c}</th>)}</tr></thead>
              <tbody>{table.rows.map((r, i) => <tr key={i} className="border-b border-ink-100">{r.map((v, j) => <td key={j} className="py-1.5 pr-3 text-ink-800" data-tabular>{v ?? '—'}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : children}
      </div>
    </section>
  );
}

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-white px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium text-ink-900">{labelFormatter ? labelFormatter(label, payload) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-600">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.payload?.fill }} aria-hidden />
          <span className="flex-1">{p.name}</span>
          <span className="font-medium text-ink-900" data-tabular>{valueFormatter(p.value, p)}</span>
        </p>
      ))}
    </div>
  );
}
