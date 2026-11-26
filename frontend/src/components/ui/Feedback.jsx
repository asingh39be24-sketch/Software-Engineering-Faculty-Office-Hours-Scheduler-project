import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './Button.jsx';
import { cn } from '../../utils/cn.js';

export function EmptyState({ icon: Icon, title, children, action, className, compact }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-ink-150 bg-ink-50 text-ink-500">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </div>
      )}
      <p className="text-md font-medium text-ink-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-brick-100 bg-brick-50 text-brick-500">
        <AlertTriangle className="h-[18px] w-[18px]" aria-hidden />
      </div>
      <p className="text-md font-medium text-ink-900">Couldn’t load this</p>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={RotateCw} className="mt-4" onClick={() => onRetry()}>Try again</Button>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 4, className }) {
  return (
    <div className={cn('space-y-2.5 p-4', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className={cn('h-9', i % 3 === 2 && 'w-4/5')} />)}
    </div>
  );
}
