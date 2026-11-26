import { RotateCw } from 'lucide-react';
import { cn } from '../../utils/cn.js';
import { initials } from '../../utils/format.js';
import { Button } from './Button.jsx';

export function Logo({ className, withText = true, tone = 'dark' }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#1c5343" />
        <path d="M9 23V9h9a5 5 0 0 1 5 5v9" fill="none" stroke="#fbfaf7" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="18" cy="17" r="2" fill="#eab94f" />
      </svg>
      {withText && (
        <span className={cn('text-[15px] font-semibold tracking-tight', tone === 'light' ? 'text-white' : 'text-ink-900')}>
          Office Hours
        </span>
      )}
    </span>
  );
}

const AVATAR_TONES = ['bg-pine-100 text-pine-800', 'bg-cobalt-100 text-cobalt-700', 'bg-marigold-100 text-marigold-600', 'bg-brick-100 text-brick-700', 'bg-ink-150 text-ink-700'];

export function Avatar({ name, size = 'md', className }) {
  const tone = AVATAR_TONES[[...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  const sizes = { sm: 'h-6 w-6 text-2xs', md: 'h-8 w-8 text-xs', lg: 'h-11 w-11 text-sm', xl: 'h-14 w-14 text-base' };
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', tone, sizes[size], className)} aria-hidden>
      {initials(name) || '?'}
    </span>
  );
}

export function PageHeader({ title, description, actions, eyebrow, onRefresh, refreshing }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="label-caps mb-1.5">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh && (
          <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => onRefresh()} loading={refreshing} aria-label="Refresh data">
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, icon: Icon, loading, accent }) {
  return (
    <div className="flex flex-col justify-between gap-3 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        {Icon && <Icon className={cn('h-3.5 w-3.5', accent || 'text-ink-400')} aria-hidden />}
      </div>
      {loading ? (
        <div className="skeleton h-7 w-14" />
      ) : (
        <div>
          <p className="text-2xl font-semibold tracking-tight text-ink-900" data-tabular>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
        </div>
      )}
    </div>
  );
}

/** A row of stats sharing hairline dividers, rather than separate floating cards. */
export function StatGroup({ children, className }) {
  return (
    <div className={cn('grid gap-px overflow-hidden rounded-md border border-ink-150 bg-ink-150 shadow-xs', className)}>{children}</div>
  );
}

export function Section({ title, description, actions, children, className, bodyClassName }) {
  return (
    <section className={cn('card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {description && <p className="text-xs text-ink-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Segmented control / tabs with proper roles and arrow-key navigation. */
export function Tabs({ value, onChange, items, label, className }) {
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    onChange(next.value);
    document.getElementById(`tab-${label}-${next.value}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn('scroll-thin flex gap-1 overflow-x-auto border-b border-ink-150', className)}>
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            id={`tab-${label}-${it.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(it.value)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-sm font-medium transition-colors',
              active ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800'
            )}
          >
            {it.label}
            {it.count !== undefined && (
              <span className={cn('rounded-sm px-1 text-2xs', active ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600')} data-tabular>
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function DefinitionList({ items, className }) {
  return (
    <dl className={cn('divide-y divide-ink-100', className)}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="grid grid-cols-3 gap-3 py-2.5 text-sm">
          <dt className="text-ink-500">{k}</dt>
          <dd className="col-span-2 break-words text-ink-900">{v ?? <span className="text-ink-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
