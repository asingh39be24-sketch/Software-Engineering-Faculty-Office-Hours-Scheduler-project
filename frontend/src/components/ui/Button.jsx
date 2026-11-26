import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn.js';

const VARIANTS = {
  primary: 'bg-pine-700 text-white hover:bg-pine-800 active:bg-pine-900 shadow-xs disabled:bg-pine-700/50',
  dark: 'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 shadow-xs disabled:bg-ink-900/50',
  secondary: 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 hover:border-ink-300 shadow-xs disabled:text-ink-400',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-400',
  danger: 'bg-white text-brick-600 border border-brick-200 hover:bg-brick-50 hover:border-brick-500/40 disabled:opacity-50',
  'danger-solid': 'bg-brick-600 text-white hover:bg-brick-700 shadow-xs disabled:opacity-50',
};
const SIZES = {
  xs: 'h-7 px-2 text-xs gap-1',
  sm: 'h-8 px-2.5 text-sm gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-md gap-2',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, iconRight: IconRight, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded font-medium transition-colors duration-100 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
      {IconRight && !loading && <IconRight className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
});

export function IconButton({ label, icon: Icon, className, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('inline-flex h-8 w-8 items-center justify-center rounded text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900', className)}
      {...rest}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
