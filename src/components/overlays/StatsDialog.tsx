import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { voice } from '@/lib/rtc/engine';

/** De quanto em quanto tempo o relatório se atualiza sozinho. */
const REFRESH_MS = 1000;

/**
 * O diagnóstico da conexão, em texto e em português.
 *
 * Quem abre isto está tentando entender por que a chamada está ruim — daí a
 * atualização contínua: o número que importa é o de agora, não o de quando a
 * janela abriu.
 */
export function StatsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [report, setReport] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;

    const refresh = () => {
      void voice.report().then((text) => alive && setReport(text));
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open]);

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Status da conexão"
      cancelLabel="Fechar"
      hideConfirm
      wide
    >
      <pre className="selectable max-h-96 overflow-auto rounded-[var(--radius-sm)] bg-field p-3
                      font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-text">
        {report || 'Coletando…'}
      </pre>
    </Modal>
  );
}
