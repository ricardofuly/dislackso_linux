import type { ReactNode } from 'react';
import { Tooltip as RadixTooltip } from 'radix-ui';

export const TooltipProvider = RadixTooltip.Provider;

interface TipProps {
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/** Dica curta ao pousar o cursor. Precisa de um `TooltipProvider` acima. */
export function Tip({ label, children, side = 'top' }: TipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={8}
          className="glass glass-card anim-drop z-70 max-w-64 px-2.5 py-1.5 text-[12px] text-bright"
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
