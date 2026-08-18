import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useLiquidPointer } from '@/hooks/useLiquidPointer';

type Variant = 'panel' | 'card' | 'pill';

interface GlassProps {
  as?: ElementType;
  variant?: Variant;
  /** O brilho especular segue o ponteiro. Ligue só onde o cursor costuma passar. */
  live?: boolean;
  /** Refração de verdade (filtro SVG). Cara: reserve para superfícies flutuantes. */
  refract?: boolean;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
}

const VARIANT_CLASS: Record<Variant, string> = {
  panel: 'glass-panel',
  card: 'glass-card',
  pill: 'glass-pill',
};

/**
 * Uma superfície de vidro líquido.
 *
 * Toda a aparência vem de `glass.css`; este componente só escolhe a variante
 * e, quando pedido, liga o brilho que acompanha o cursor.
 */
export function Glass({
  as: Tag = 'div',
  variant = 'panel',
  live = false,
  refract = false,
  className,
  children,
  ...rest
}: GlassProps) {
  const ref = useLiquidPointer<HTMLElement>(live);

  return (
    <Tag
      ref={ref}
      className={cn(
        'glass',
        VARIANT_CLASS[variant],
        live && 'glass-live',
        refract && 'glass-refract',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * O filtro de refração, montado uma vez no topo do app.
 *
 * A turbulência gera um mapa de deslocamento e o `feDisplacementMap` empurra
 * os pixels do que está atrás do vidro seguindo esse mapa — é o que curva as
 * bordas do que passa por baixo, como uma lente de verdade. Fica escondido:
 * o SVG só existe para ser referenciado por `backdrop-filter: url(...)`.
 */
export function GlassFilters() {
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0" focusable="false">
      <defs>
        <filter id="liquid-refract" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.008"
            numOctaves={2}
            seed={7}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="3" result="soft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="soft"
            scale="14"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
