import type { ReactNode } from 'react';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import { cn } from '@/lib/cn';

/**
 * Menus suspensos e de botão direito.
 *
 * Os dois compartilham a mesma aparência e as mesmas classes de item; o que
 * muda é só o gatilho. Vêm do Radix porque posicionamento (não sair da tela),
 * fechar ao clicar fora, navegação por teclado e foco são exatamente o que a
 * versão manual do 3.x fazia na unha — e errava perto das bordas.
 */
const SURFACE = cn(
  'glass glass-card glass-refract anim-drop z-50 min-w-52 overflow-hidden p-1.5',
  'text-sm text-text shadow-(--shadow-lift)',
);

const ITEM = cn(
  'flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-xs)] px-2.5 py-2',
  'outline-none transition-colors duration-(--duration-fast)',
  'data-[highlighted]:bg-hover data-[highlighted]:text-bright',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
);

const DANGER = 'text-red data-[highlighted]:bg-red/15 data-[highlighted]:text-red';

const SEPARATOR = 'my-1.5 h-px bg-line';

export interface MenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect(): void;
  /** Desenha um traço acima deste item. */
  separatorBefore?: boolean;
}

function renderItems(
  actions: MenuAction[],
  Item: typeof DropdownMenu.Item | typeof ContextMenu.Item,
  Separator: typeof DropdownMenu.Separator | typeof ContextMenu.Separator,
) {
  return actions.map((action) => (
    <div key={action.id}>
      {action.separatorBefore && <Separator className={SEPARATOR} />}
      <Item
        className={cn(ITEM, action.danger && DANGER)}
        disabled={action.disabled}
        onSelect={action.onSelect}
      >
        {action.icon}
        {action.label}
      </Item>
    </div>
  ));
}

interface DropMenuProps {
  trigger: ReactNode;
  actions: MenuAction[];
  align?: 'start' | 'center' | 'end';
}

export function DropMenu({ trigger, actions, align = 'start' }: DropMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className={SURFACE}>
          {renderItems(actions, DropdownMenu.Item, DropdownMenu.Separator)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface RightClickMenuProps {
  children: ReactNode;
  actions: MenuAction[];
}

export function RightClickMenu({ children, actions }: RightClickMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={SURFACE}>
          {renderItems(actions, ContextMenu.Item, ContextMenu.Separator)}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
