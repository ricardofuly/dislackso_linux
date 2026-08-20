import { Megaphone } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { FormattedText } from '@/components/ui/FormattedText';
import { useAnnouncements } from '@/stores/announcements';

/**
 * Aviso do painel de desenvolvedor.
 *
 * Um por vez: a fila garante que um aviso que chega enquanto outro está na
 * tela espere a vez em vez de substituí-lo.
 */
export function AnnouncementDialog() {
  const current = useAnnouncements((s) => s.queue[0]);
  const dismiss = useAnnouncements((s) => s.dismiss);

  return (
    <Modal
      open={Boolean(current)}
      onOpenChange={(next) => !next && dismiss()}
      title="Aviso importante"
      confirmLabel="Ok, entendi"
      onConfirm={dismiss}
      footer={undefined}
      hideConfirm={false}
    >
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Megaphone size={20} />
        </span>
        <FormattedText text={current?.message ?? ''} className="text-[14px] whitespace-pre-wrap text-text" />
      </div>
    </Modal>
  );
}
