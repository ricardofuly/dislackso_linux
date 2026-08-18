import { AnimatePresence, motion } from 'motion/react';
import { useToasts } from '@/stores/toasts';

/**
 * A pilha de avisos, no rodapé.
 *
 * Empilha em vez de substituir: no 3.x um aviso novo apagava o anterior, e
 * mensagens que importam ("fulano começou a transmitir") sumiam antes de
 * serem lidas.
 */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-60 flex flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            layout
            initial={{ opacity: 0, y: 18, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={() => dismiss(toast.id)}
            className="glass glass-card glass-refract pointer-events-auto max-w-[min(90vw,30rem)]
                       px-4 py-2.5 text-sm text-bright shadow-(--shadow-lift)"
          >
            {toast.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
