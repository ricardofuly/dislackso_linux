import { useEffect, useRef } from 'react';
import { annot } from '@/lib/annot/engine';
import { useRoom } from '@/stores/room';
import { cn } from '@/lib/cn';
import { AnnotationToolbar } from './AnnotationToolbar';

interface AnnotationLayerProps {
  targetId: string;
  video(): HTMLVideoElement | null;
}

/**
 * A camada de rabisco sobre um vídeo.
 *
 * O React só monta o `<canvas>` e o registra no motor; quem desenha é o motor,
 * num `requestAnimationFrame` próprio. Passar cada ponto do ponteiro por
 * `setState` re-renderizaria a árvore dezenas de vezes por segundo para
 * pintar uma linha.
 */
export function AnnotationLayer({ targetId, video }: AnnotationLayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // O modo caneta vive no motor (não é estado do React); `tick` é o que faz
  // este componente repintar quando ele muda.
  useRoom((s) => s.tick);
  const drawing = annot.isActive(targetId);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    return annot.register(targetId, { host, canvas, video });
  }, [targetId, video]);

  return (
    <>
      <div
        ref={hostRef}
        className={cn(
          'absolute inset-0 touch-none',
          drawing ? 'cursor-crosshair' : 'pointer-events-none',
        )}
      >
        <canvas ref={canvasRef} className="size-full" />
      </div>
      {drawing && <AnnotationToolbar targetId={targetId} />}
    </>
  );
}
