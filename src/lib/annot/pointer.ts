import type { AnnotPoint, AnnotTool } from '@/types/api';
import { tell } from '@/lib/socket/client';
import { isDesktop, desktop } from '@/lib/platform';
import { voice } from '@/lib/rtc/engine';
import { useSession } from '@/stores/session';
import { toNormalized } from './geometry';
import type { Stroke } from './render';

/** Intervalo mínimo entre envios de pontos novos, em ms. */
const SEND_THROTTLE_MS = 55;

export interface DrawSurface {
  targetId: string;
  host: HTMLElement;
  video: () => HTMLVideoElement | null;
  strokes: Map<string, Stroke>;
}

export interface DrawSettings {
  /** O alvo em que o modo caneta está ligado agora, ou `null`. */
  activeTarget: () => string | null;
  tool: () => AnnotTool;
  color: () => string;
  size: () => number;
  /** `'local'` → o meu sid, que é como os outros me conhecem. */
  wireTarget: (targetId: string) => string;
}

/**
 * Traduz o ponteiro em traços e os manda para a sala.
 *
 * Mandamos só os pontos novos desde o último envio, no máximo a cada 55 ms —
 * um traço à mão gera dezenas de pontos por segundo e enviar cada um viraria
 * uma enxurrada de pacotes sem ganho visual nenhum.
 *
 * Devolve a função que desliga tudo.
 */
export function wireDrawing(surface: DrawSurface, cfg: DrawSettings): () => void {
  const { host } = surface;
  let current: Stroke | null = null;
  let pending: AnnotPoint[] = [];
  let lastSend = 0;

  const flush = (end: boolean) => {
    if (!current) return;
    const me = useSession.getState().me;
    const authorName = me?.name || 'Você';
    const authorColor = me?.color || current.color;
    const isArrow = current.tool === 'seta';
    const pts = isArrow ? current.pts : pending;

    tell('annot:draw', {
      target: cfg.wireTarget(surface.targetId),
      id: current.id,
      tool: current.tool,
      color: current.color,
      size: current.size,
      authorName,
      authorColor,
      // Na seta mandamos os dois pontos sempre; é barato e evita remontagem.
      pts,
      replace: isArrow,
      end,
    });

    // Se estiver desenhando na própria tela transmitida, projeta no overlay desktop local
    if (surface.targetId === 'local' && isDesktop() && voice.screen.active) {
      void desktop()?.overlay.stroke({
        id: current.id,
        tool: current.tool,
        color: current.color,
        size: current.size,
        authorName,
        authorColor,
        pts,
        replace: isArrow,
        end,
      });
    }

    pending = [];
    lastSend = performance.now();
  };

  const down = (e: PointerEvent) => {
    if (cfg.activeTarget() !== surface.targetId || e.button !== 0) return;
    e.preventDefault();
    try {
      host.setPointerCapture(e.pointerId);
    } catch {
      /* alguns dispositivos recusam a captura; o desenho ainda funciona */
    }

    const me = useSession.getState().me;
    const point = toNormalized(host, surface.video(), e.clientX, e.clientY);
    current = {
      id: Math.random().toString(36).slice(2, 11),
      tool: cfg.tool(),
      color: cfg.color(),
      size: cfg.size(),
      authorName: me?.name || 'Você',
      authorColor: me?.color || cfg.color(),
      pts: [point],
      born: performance.now(),
    };
    surface.strokes.set(current.id, current);
    pending = [point];
    lastSend = 0;
    flush(false);
  };

  const move = (e: PointerEvent) => {
    if (!current) return;
    const point = toNormalized(host, surface.video(), e.clientX, e.clientY);

    // A seta só tem começo e fim: o resto do arrasto move a ponta.
    if (current.tool === 'seta') current.pts[1] = point;
    else current.pts.push(point);

    pending.push(point);
    current.born = performance.now();
    if (performance.now() - lastSend > SEND_THROTTLE_MS) flush(false);
  };

  const finish = (e: PointerEvent) => {
    if (!current) return;
    try {
      host.releasePointerCapture(e.pointerId);
    } catch {
      /* já foi solto */
    }
    flush(true);
    current = null;
  };

  const events = [
    ['pointerdown', down],
    ['pointermove', move],
    ['pointerup', finish],
    ['pointercancel', finish],
    ['pointerleave', finish],
  ] as const;

  for (const [name, fn] of events) host.addEventListener(name, fn as EventListener);

  return () => {
    for (const [name, fn] of events) host.removeEventListener(name, fn as EventListener);
    current = null;
  };
}
