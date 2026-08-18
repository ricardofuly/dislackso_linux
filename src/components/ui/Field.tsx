import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-[var(--radius-sm)] border border-line bg-field px-3 py-2 text-sm text-bright '
  + 'placeholder:text-dim/70 outline-none transition-[border-color,box-shadow] '
  + 'duration-(--duration-fast) focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] '
  + 'disabled:opacity-60';

interface FieldProps {
  label?: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}

/** Rótulo + controle + dica, com o `id` já ligado nos dois. */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-[11px] font-semibold tracking-wide text-dim uppercase">
          {label}
        </label>
      )}
      {children(id)}
      {hint && <p className="text-[12px] leading-snug text-dim">{hint}</p>}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'resize-none', className)} {...rest} />;
}
