import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useRoom } from '@/stores/room';
import { PeerAudio } from './PeerAudio';
import { Tile } from './Tile';
import { resolveFocus, useStageEntries } from './useStageEntries';

/**
 * A área de vídeo da sala.
 *
 * Dois modos: grade (todo mundo do mesmo tamanho) e destaque (uma tela
 * grande, o resto numa fita embaixo). A troca entre eles é animada pelo
 * `layout` do Motion — os tiles *deslizam* de um arranjo para o outro em vez
 * de sumirem e reaparecerem.
 */
export function VoiceStage() {
  const entries = useStageEntries();
  const focusId = useRoom((s) => s.focusId);
  const focus = useRoom((s) => s.focus);
  const focused = resolveFocus(entries, focusId);

  const strip = focused ? entries.filter((e) => e.id !== focused.id) : [];

  return (
    // `overflow-hidden` aqui e nos containers abaixo não é só estética: um
    // tile em transição de layout (Motion recalcula grade quando alguém
    // entra/sai) pode momentaneamente sofrer um FLIP exagerado e visualmente
    // "escapar" da área da chamada por um instante — sem isto, numa janela
    // transparente, ele fica flutuando fora do app até a próxima repintura.
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
      <PeerAudio />

      {focused ? (
        <>
          <div className="min-h-0 flex-1 overflow-hidden">
            <Tile key={focused.id} entry={focused} focused />
          </div>

          {strip.length > 0 && (
            <div className="flex h-28 shrink-0 gap-2 overflow-x-auto overflow-y-hidden">
              <AnimatePresence initial={false}>
                {strip.map((entry) => (
                  <div key={entry.id} className="aspect-video h-full shrink-0">
                    <Tile entry={entry} focused={false} clickable onClick={() => focus(entry.id)} />
                  </div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      ) : (
        <motion.div
          layout
          className={cn(
            'grid min-h-0 flex-1 gap-2 overflow-hidden',
            entries.length === 1 && 'grid-cols-1',
            entries.length === 2 && 'grid-cols-2',
            entries.length > 2 && 'grid-cols-2 xl:grid-cols-3',
          )}
        >
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <Tile key={entry.id} entry={entry} focused={false} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
