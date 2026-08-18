import type { ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Rodapé personalizado. Sem ele, aparecem Cancelar + confirmar. */
  footer?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Devolva `false` para manter aberto (validação falhou). */
  onConfirm?(): boolean | void | Promise<boolean | void>;
  danger?: boolean;
  hideConfirm?: boolean;
  wide?: boolean;
}

/**
 * A janela modal do app.
 *
 * Vem do Radix por um motivo prático: foco preso dentro do diálogo, Escape,
 * clique fora, `aria` e rolagem do fundo travada são exatamente as coisas que
 * a versão feita à mão errava — e eram a origem de metade dos "bugs de
 * interface" (modal que não fechava, foco que fugia, dois modais empilhados).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  danger,
  hideConfirm,
  wide,
}: ModalProps) {
  const confirm = async () => {
    const result = await onConfirm?.();
    if (result !== false) onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-veil fixed inset-0 z-50 bg-black/55" />
        <Dialog.Content
          className={cn(
            'anim-lift glass glass-card glass-refract fixed top-1/2 left-1/2 z-50 w-[min(92vw,var(--modal-w))]',
            '-translate-x-1/2 -translate-y-1/2 p-6 text-text outline-none',
            wide ? '[--modal-w:720px]' : '[--modal-w:440px]',
          )}
        >
          <Dialog.Title className="mb-1 text-lg font-semibold text-bright">{title}</Dialog.Title>
          <Dialog.Description className={cn('mb-4 text-[13px] text-dim', !description && 'sr-only')}>
            {description ?? title}
          </Dialog.Description>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto">{children}</div>

          <div className="mt-5 flex justify-end gap-2">
            {footer ?? (
              <>
                <Dialog.Close asChild>
                  <Button variant="ghost">{cancelLabel}</Button>
                </Dialog.Close>
                {!hideConfirm && (
                  <Button variant={danger ? 'danger' : 'primary'} onClick={() => void confirm()}>
                    {confirmLabel}
                  </Button>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
