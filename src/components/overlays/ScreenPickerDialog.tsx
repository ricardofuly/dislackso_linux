import { useMemo, useState } from 'react';
import { CheckCircle2, Grid2x2, Monitor } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/cn';
import { useSettings } from '@/stores/settings';
import { useScreenPicker } from '@/stores/screenPicker';
import type { ScreenSource } from '@/lib/platform';

type Filter = 'screen' | 'window';

/**
 * "O que você quer compartilhar?" — só existe no app desktop.
 *
 * O Electron não mostra o seletor nativo do sistema (o navegador mostra
 * sozinho); no app instalado, quem decide o que aparece na lista somos nós,
 * via `desktopCapturer` no processo principal. Esta modal é a outra ponta
 * desse contrato: recebe a lista de telas e janelas e devolve a escolha.
 */
export function ScreenPickerDialog() {
  const sources = useScreenPicker((s) => s.sources);
  const respond = useScreenPicker((s) => s.respond);
  const shareSystemAudio = useSettings((s) => s.shareSystemAudio);
  const setSetting = useSettings((s) => s.set);

  const [filter, setFilter] = useState<Filter>('screen');
  const [chosenId, setChosenId] = useState<string | null>(null);

  const items = useMemo(() => (sources ?? []).filter((s) => s.type === filter), [sources, filter]);

  const close = (choice: { id: string; audio: boolean } | null) => {
    respond(choice);
    setChosenId(null);
    setFilter('screen');
  };

  const confirm = (id: string | null) => {
    if (!id) return false;
    close({ id, audio: shareSystemAudio });
  };

  return (
    <Modal
      open={Boolean(sources)}
      onOpenChange={(next) => !next && close(null)}
      title="O que você quer compartilhar?"
      confirmLabel="Compartilhar"
      wide
      onConfirm={() => confirm(chosenId)}
    >
      <div className="flex gap-1 rounded-[var(--radius-sm)] bg-bg-1/60 p-1">
        <FilterTab active={filter === 'screen'} onClick={() => setFilter('screen')}>
          <Monitor size={16} /> Telas inteiras
        </FilterTab>
        <FilterTab active={filter === 'window'} onClick={() => setFilter('window')}>
          <Grid2x2 size={16} /> Janelas
        </FilterTab>
      </div>

      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {items.length === 0 && <p className="col-span-full py-6 text-center text-[13px] text-dim">Nada encontrado aqui.</p>}
        {items.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            selected={chosenId === source.id}
            onClick={() => setChosenId(source.id)}
            onDoubleClick={() => confirm(source.id)}
          />
        ))}
      </div>

      {filter === 'screen' ? (
        <div className="space-y-1.5 rounded-[var(--radius-sm)] bg-bg-1/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-text">Compartilhar áudio do sistema</span>
            <Toggle
              label="Compartilhar áudio do sistema"
              checked={shareSystemAudio}
              onChange={(v) => setSetting('shareSystemAudio', v)}
            />
          </div>
          <p className="text-[12px] leading-snug text-dim">
            Inclui os sons do seu computador (jogos, vídeos e sistema). O DiSlackso isola a chamada para evitar retorno.
          </p>
        </div>
      ) : (
        <p className="rounded-[var(--radius-sm)] bg-bg-1/60 p-3 text-[12px] leading-snug text-dim">
          Janelas específicas não têm áudio do sistema — só o vídeo.
        </p>
      )}
    </Modal>
  );
}

function FilterTab({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-xs)] px-3 py-1.5',
        'text-[13px] font-medium transition-colors duration-(--duration-fast)',
        active ? 'bg-accent text-accent-fg' : 'text-dim hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

interface SourceCardProps {
  source: ScreenSource;
  selected: boolean;
  onClick(): void;
  onDoubleClick(): void;
}

function SourceCard({ source, selected, onClick, onDoubleClick }: SourceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        'relative flex scale-100 flex-col overflow-hidden rounded-[var(--radius-sm)] ring-1',
        'transition-all duration-(--duration-fast) hover:ring-accent',
        selected ? 'ring-3 ring-accent' : 'ring-line',
      )}
    >
      <span className="relative aspect-video w-full bg-bg-1">
        <img src={source.thumbnail} alt="" className="size-full object-cover" draggable={false} />
        <span
          className={cn(
            'absolute inset-0 bg-accent/25 transition-opacity duration-(--duration-fast)',
            selected ? 'opacity-100' : 'opacity-0',
          )}
        />
        {selected && (
          <CheckCircle2
            size={26}
            className="absolute top-1.5 right-1.5 rounded-full bg-bg-0 text-accent drop-shadow"
          />
        )}
      </span>
      <span
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 text-left text-[12px]',
          selected ? 'bg-accent text-accent-fg' : 'bg-bg-3 text-text',
        )}
      >
        {source.icon && <img src={source.icon} alt="" className="size-3.5 shrink-0" />}
        <span className="truncate">{source.name}</span>
      </span>
    </button>
  );
}
