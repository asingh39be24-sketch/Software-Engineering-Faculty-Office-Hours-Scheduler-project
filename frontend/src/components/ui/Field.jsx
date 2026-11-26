import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn.js';

const control =
  'block w-full rounded border bg-white px-3 text-base text-ink-900 placeholder:text-ink-400 shadow-xs transition-colors ' +
  'focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20 disabled:bg-ink-50 disabled:text-ink-500';

export function Field({ label, hint, error, children, className, required, htmlFor }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
          {label}
          {required && <span className="ml-0.5 text-brick-500" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={htmlFor && `${htmlFor}-error`} className="text-xs text-brick-600" role="alert">{error}</p>
      ) : hint ? (
        <p id={htmlFor && `${htmlFor}-hint`} className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, hint, error, className, id, required, icon: Icon, ...rest }, ref) {
  const autoId = useId();
  const inputId = id || autoId;
  const input = (
    <div className="relative">
      {Icon && <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(control, 'h-9', Icon && 'pl-8', error && 'border-brick-500 focus:border-brick-500 focus:ring-brick-500/20', !error && 'border-ink-200', className)}
        {...rest}
      />
    </div>
  );
  if (!label && !hint && !error) return input;
  return <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>{input}</Field>;
});

export const Select = forwardRef(function Select({ label, hint, error, className, id, children, required, ...rest }, ref) {
  const autoId = useId();
  const selectId = id || autoId;
  const el = (
    <div className="relative">
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(control, 'h-9 appearance-none pr-8', error ? 'border-brick-500' : 'border-ink-200', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
    </div>
  );
  if (!label && !hint && !error) return el;
  return <Field label={label} hint={hint} error={error} required={required} htmlFor={selectId}>{el}</Field>;
});

export const Textarea = forwardRef(function Textarea({ label, hint, error, className, id, required, ...rest }, ref) {
  const autoId = useId();
  const tid = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={tid}>
      <textarea
        ref={ref}
        id={tid}
        aria-invalid={error ? true : undefined}
        className={cn(control, 'min-h-[76px] py-2', error ? 'border-brick-500' : 'border-ink-200', className)}
        {...rest}
      />
    </Field>
  );
});
