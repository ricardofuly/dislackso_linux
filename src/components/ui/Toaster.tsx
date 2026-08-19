import { AnimatePresence, motion } from 'motion/react';
import { useToasts } from '@/stores/toasts';
import { isDesktop } from '@/lib/platform';
import { cn } from '@/lib/cn';

/**
 * A pilha de avisos, no topo.
 *
 * Empilha em vez de substituir: no 3.x um aviso novo apagava o anterior, e
 * mensagens que importam ("fulano começou a transmitir") sumiam antes de
 * serem lidas.
 *
 * Fica no topo (e não no rodapé, como no 3.x) porque é onde quem está
 * compartilhando tela ou numa chamada realmente olha — o rodapé costuma estar
 * coberto pela barra de digitação ou pelos controles da chamada.
 */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-60 flex flex-col items-center gap-2',
        // No desktop a faixa de arrastar a janela e os botões nativos do
        // sistema ocupam os primeiros ~32px — os avisos entram depois deles.
        isDesktop() ? 'top-11' : 'top-4',
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            layout
            initial={{ opacity: 0, y: -18, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={() => {
              toast.onClick?.();
              dismiss(toast.id);
            }}
            className={cn(
              'glass glass-card glass-refract pointer-events-auto max-w-[min(90vw,30rem)]',
              'px-4 py-2.5 text-sm text-bright shadow-(--shadow-lift)',
              toast.onClick && 'ring-1 ring-accent',
            )}
          >
            {toast.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
