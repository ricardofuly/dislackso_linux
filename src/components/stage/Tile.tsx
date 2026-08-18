import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Eye, Volume2, Zap } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { AnnotationLayer } from '@/components/annotate/AnnotationLayer';
import { cn } from '@/lib/cn';
import { useRoom } from '@/stores/room';
import { watchPeer } from '@/features/voice/actions';
import { TileBar } from './TileBar';
import type { StageEntry } from './useStageEntries';

interface TileProps {
  entry: StageEntry;
  focused: boolean;
  /** No filmstrip o tile inteiro vira botão de destacar. */
  clickable?: boolean;
  onClick?(): void;
}

/**
 * Um participante no palco: o vídeo dele, ou o avatar quando não há vídeo.
 *
 * O estado que importa aqui é o do meio: a pessoa anunciou que está
 * transmitindo, mas eu ainda não pedi para assistir. Nesse caso mostramos a
 * miniatura estática e um botão — sem gastar a banda dela nem a minha até eu
 * realmente querer ver.
 */
export function Tile({ entry, focused, clickable, onClick }: TileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const watching = useRoom((s) => s.watching.has(entry.id));
  const preview = useRoom((s) => s.previews.get(entry.id));
  const [needsGesture, setNeedsGesture] = useState(false);

  const pending = !entry.isLocal && entry.intendsScreen && !entry.sharing && !watching;
  const showVideo = entry.sharing && Boolean(entry.stream);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!showVideo || !entry.stream) {
      video.srcObject = null;
      return;
    }
    if (video.srcObject === entry.stream) return;

    video.srcObject = entry.stream;
    video.muted = entry.isLocal; // nunca tocar o próprio áudio: vira eco
    video.play().catch(() => setNeedsGesture(true));
  }, [showVideo, entry.stream, entry.isLocal]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      onClick={clickable ? onClick : undefined}
      className={cn(
        'group relative flex min-h-0 items-center justify-center overflow-hidden rounded-[var(--radius-lg)]',
        'bg-tile ring-1 ring-line transition-shadow duration-(--duration-med)',
        entry.speaking && 'ring-2 ring-green',
        focused && 'ring-2 ring-accent',
        clickable && 'cursor-pointer hover:ring-accent',
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={cn('size-full object-contain', !showVideo && 'hidden')}
      />

      {!showVideo && !pending && (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <Avatar user={entry.user} size="lg" speaking={entry.speaking} />
          <p className="text-[13px] text-dim">{entry.status}</p>
        </div>
      )}

      {pending && <WatchPrompt preview={preview} onWatch={() => watchPeer(entry.id)} />}

      {showVideo && (
        <AnnotationLayer targetId={entry.id} video={() => videoRef.current} />
      )}

      {(entry.sharing || entry.intendsScreen) && (
        <span className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1
                         rounded-full bg-red px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
          <Zap size={10} />
          {entry.isLocal ? 'TRANSMITINDO' : 'AO VIVO'}
        </span>
      )}

      {needsGesture && (
        <Button
          variant="primary"
          className="absolute inset-x-0 bottom-14 mx-auto w-fit"
          onClick={(e) => {
            e.stopPropagation();
            void videoRef.current?.play();
            setNeedsGesture(false);
          }}
        >
          <Volume2 size={16} /> Clique para ativar o som
        </Button>
      )}

      <TileBar entry={entry} focused={focused} showVideo={showVideo} video={() => videoRef.current} />
    </motion.div>
  );
}

function WatchPrompt({ preview, onWatch }: { preview?: string; onWatch(): void }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      {preview && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-45 blur-[2px]"
          style={{ backgroundImage: `url('${preview}')` }}
        />
      )}
      <Button
        variant="primary"
        className="relative"
        onClick={(e) => {
          e.stopPropagation();
          onWatch();
        }}
      >
        <Eye size={16} /> Assistir transmissão
      </Button>
    </div>
  );
}
