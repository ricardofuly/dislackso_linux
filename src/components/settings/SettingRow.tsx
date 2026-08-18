import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SettingRowProps {
  title: string;
  desc?: ReactNode;
  /** Controles largos (medidores, paletas, campos) descem para a linha de baixo. */
  stack?: boolean;
  children: ReactNode;
}

/** A linha padrão de uma configuração: título, explicação e o controle. */
export function SettingRow({ title, desc, stack, children }: SettingRowProps) {
  return (
    <div
      className={cn(
        'border-b border-line py-4 last:border-0',
        stack ? 'space-y-3' : 'flex items-center gap-6',
      )}
    >
      <div className={cn('min-w-0', !stack && 'flex-1')}>
        <p className="text-[14px] font-medium text-bright">{title}</p>
        {desc && <p className="mt-0.5 text-[12px] leading-snug text-dim">{desc}</p>}
      </div>
      <div className={cn(!stack && 'shrink-0')}>{children}</div>
    </div>
  );
}

/** Nota solta no fim de uma seção — contexto que não pertence a nenhuma linha. */
export function SettingNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-[var(--radius-sm)] bg-bg-1/60 p-3 text-[12px] leading-relaxed text-dim">
      {children}
    </p>
  );
}

/** `<select>` com a aparência do app. */
export function Select({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange(value: string): void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-52 rounded-[var(--radius-sm)] border border-line bg-field px-3 py-2
                 text-[13px] text-bright outline-none focus:border-accent disabled:opacity-60"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Paleta de cores clicáveis. */
export function Swatches({
  colors,
  value,
  onPick,
}: {
  colors: readonly string[];
  value: string;
  onPick(color: string): void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Cor ${color}`}
          onClick={() => onPick(color)}
          style={{ background: color }}
          className={cn(
            'size-7 rounded-full transition-transform duration-(--duration-fast) hover:scale-110',
            value === color && 'ring-2 ring-bright ring-offset-2 ring-offset-bg-2',
          )}
        />
      ))}
    </div>
  );
}
