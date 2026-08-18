import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'soft' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'block';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-medium '
  + 'transition-[background-color,color,transform,box-shadow] duration-(--duration-fast) '
  + 'ease-(--ease-glass) active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-fg shadow-(--shadow-soft) hover:brightness-110 '
    + 'hover:shadow-[0_6px_20px_var(--color-accent-soft)]',
  soft: 'bg-bg-4 text-bright hover:bg-line-strong',
  ghost: 'text-dim hover:bg-hover hover:text-bright',
  danger: 'bg-red text-white hover:bg-red-deep',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9.5 px-4 text-sm',
  block: 'h-10 w-full px-4 text-sm',
};

export function Button({
  variant = 'soft',
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Vira `title` e `aria-label`: todo botão só de ícone precisa dos dois. */
  label: string;
  active?: boolean;
  children: ReactNode;
}

/** Botão quadrado de um ícone só — barras de topo, HUD, controles de tile. */
export function IconButton({ label, active, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-grid size-8 place-items-center rounded-[var(--radius-sm)] text-dim',
        'transition-[background-color,color,transform] duration-(--duration-fast) ease-(--ease-glass)',
        'hover:bg-hover hover:text-bright active:scale-90',
        active && 'bg-accent-soft text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
