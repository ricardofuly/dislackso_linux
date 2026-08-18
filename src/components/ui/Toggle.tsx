import { Switch, Slider as RadixSlider } from 'radix-ui';
import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  disabled?: boolean;
}

/** Interruptor. O botão desliza; o fundo muda de cor junto. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border border-line transition-colors',
        'duration-(--duration-med) ease-glass disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-bg-4',
      )}
    >
      <Switch.Thumb
        className={cn(
          'block size-4.5 translate-x-0.75 rounded-full bg-white shadow-(--shadow-soft)',
          'transition-transform duration-(--duration-med) ease-bounce',
          'data-[state=checked]:translate-x-5.75',
        )}
      />
    </Switch.Root>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  label: string;
}

/** Controle deslizante. A trilha preenchida usa a cor de destaque. */
export function Slider({ value, min, max, step = 1, onChange, label }: SliderProps) {
  return (
    <RadixSlider.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v ?? min)}
      aria-label={label}
      className="relative flex h-5 w-full touch-none items-center select-none"
    >
      <RadixSlider.Track className="relative h-1.5 grow rounded-full bg-bg-4">
        <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        className={cn(
          'block size-4 rounded-full bg-white shadow-(--shadow-soft) outline-none',
          'transition-transform duration-(--duration-fast) hover:scale-115 focus-visible:scale-115',
        )}
      />
    </RadixSlider.Root>
  );
}
