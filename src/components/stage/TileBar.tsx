import { Expand, EyeOff, Grid2x2, Maximize2, Pen, PictureInPicture2, Shrink } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { annot } from '@/lib/annot/engine';
import { cn } from '@/lib/cn';
import { useRoom } from '@/stores/room';
import { toast } from '@/stores/toasts';
import { enterFullscreen, exitFullscreen, unwatchPeer } from '@/features/voice/actions';
import type { StageEntry } from './useStageEntries';

interface TileBarProps {
  entry: StageEntry;
  focused: boolean;
  fullscreen?: boolean;
  showVideo: boolean;
  video(): HTMLVideoElement | null;
  root(): HTMLElement | null;
  /** `undefined` = comportamento normal (hover). Definido = tela cheia controla a visibilidade. */
  controlsVisible?: boolean;
}

/**
 * A barra que aparece ao pousar o cursor sobre um tile.
 *
 * Fica escondida até o hover de propósito: numa grade de cinco pessoas, cinco
 * barras de botões permanentes competem com o que se está tentando assistir.
 * Em tela cheia não há hover (o cursor já está sempre "sobre" o tile), então
 * `controlsVisible` assume o controle: visível ao mexer o mouse, escondida
 * depois de alguns segundos parado — como no YouTube.
 */
export function TileBar({ entry, focused, fullscreen, showVideo, video, root, controlsVisible }: TileBarProps) {
  const focus = useRoom((s) => s.focus);

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1',
        'bg-gradient-to-t from-black/75 to-transparent px-3 pt-8 pb-2',
        'transition-opacity duration-(--duration-fast)',
        controlsVisible === undefined
          ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
          : controlsVisible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white">
        {entry.user?.name}
        {entry.isLocal && ' (você)'}
      </span>

      <span className="pointer-events-auto flex items-center gap-0.5">
        {showVideo && entry.canAnnotate && (
          <IconButton
            label="Rabiscar na tela (P)"
            active={annot.isActive(entry.id)}
            className="text-white/80 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              annot.setActive(annot.isActive(entry.id) ? null : entry.id);
            }}
          >
            <Pen size={16} />
          </IconButton>
        )}

        {showVideo && !entry.isLocal && !fullscreen && (
          <>
            <IconButton
              label="Janela flutuante"
              className="text-white/80 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                void video()
                  ?.requestPictureInPicture()
                  .catch((err: Error) => toast(`Janela flutuante indisponível: ${err.message}`));
              }}
            >
              <PictureInPicture2 size={16} />
            </IconButton>

            <IconButton
              label="Parar de assistir"
              className="text-white/80 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                unwatchPeer(entry.id);
              }}
            >
              <EyeOff size={16} />
            </IconButton>
          </>
        )}

        {(showVideo || fullscreen) && (
          <IconButton
            label={fullscreen ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
            className="text-white/80 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              if (fullscreen) exitFullscreen();
              else enterFullscreen(entry.id);
            }}
          >
            {fullscreen ? <Shrink size={16} /> : <Expand size={16} />}
          </IconButton>
        )}

        {!fullscreen && (
          <IconButton
            label={focused ? 'Voltar à grade' : 'Destacar'}
            className="text-white/80 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              focus(focused ? null : entry.id);
            }}
          >
            {focused ? <Grid2x2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
        )}
      </span>
    </div>
  );
}
