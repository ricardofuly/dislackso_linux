import type { AnnotStrokePatch, AnnotTool } from '@/types/api';
import { tell } from '@/lib/socket/client';
import { settings } from '@/stores/settings';
import { voice } from '@/lib/rtc/engine';
import { contentRect } from './geometry';
import { wireDrawing } from './pointer';
import { fadeAlpha, paintStroke, type Stroke } from './render';

export interface LayerHandle {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  /** O vídeo por baixo, para descontar a barra preta. Pode não existir ainda. */
  video: () => HTMLVideoElement | null;
}

interface Layer extends LayerHandle {
  targetId: string;
  ctx: CanvasRenderingContext2D;
  strokes: Map<string, Stroke>;
  unwire: () => void;
}

/**
 * Rabiscar sobre a tela de quem está transmitindo.
 *
 * Qualquer pessoa da sala desenha, todo mundo vê, e o traço some sozinho
 * depois de alguns segundos. Os traços vão pelo socket, não pelo WebRTC: são
 * poucos bytes e assim funcionam mesmo antes da conexão P2P terminar de subir.
 *
 * O alvo `'local'` é a minha própria tela. No socket ele vira o meu `sid`,
 * porque para os outros eu sou só mais um participante.
 */
export class AnnotEngine {
  private readonly layers = new Map<string, Layer>();
  private raf = 0;

  tool: AnnotTool = 'caneta';
  color = '#ff3b5c';
  size = 4;
  /** Onde o modo desenho está ligado. Só uma tela por vez. */
  active: string | null = null;

  /** Chamado quando algo que a interface mostra muda (ferramenta, alvo ativo). */
  onChange: (() => void) | null = null;

  start(): void {
    this.color = settings().annotColor;
    this.size = settings().annotSize;
    if (!this.raf) this.loop();
  }

  /* --------------------------------------------------------- camadas --- */

  /** Liga uma tela ao motor. Devolve a função de desligar (para o `useEffect`). */
  register(targetId: string, handle: LayerHandle): () => void {
    this.layers.get(targetId)?.unwire();

    const ctx = handle.canvas.getContext('2d');
    if (!ctx) return () => {};

    const layer: Layer = { ...handle, targetId, ctx, strokes: new Map(), unwire: () => {} };
    layer.unwire = wireDrawing(
      { targetId, host: handle.host, video: handle.video, strokes: layer.strokes },
      {
        activeTarget: () => this.active,
        tool: () => this.tool,
        color: () => this.color,
        size: () => this.size,
        wireTarget: (id) => this.wireTarget(id),
      },
    );
    this.layers.set(targetId, layer);

    return () => {
      layer.unwire();
      if (this.layers.get(targetId) === layer) this.layers.delete(targetId);
      if (this.active === targetId) this.setActive(null);
    };
  }

  setActive(targetId: string | null): void {
    this.active = targetId;
    this.onChange?.();
  }

  isActive(targetId: string): boolean {
    return this.active === targetId;
  }

  setTool(tool: AnnotTool): void {
    this.tool = tool;
    this.onChange?.();
  }

  setColor(color: string): void {
    this.color = color;
    this.onChange?.();
  }

  /* -------------------------------------------------------- recepção --- */

  applyRemote(patch: AnnotStrokePatch): void {
    const layer = this.layers.get(this.localTarget(patch.target));
    if (!layer) return;

    let stroke = layer.strokes.get(patch.id);
    if (!stroke) {
      stroke = {
        id: patch.id,
        tool: patch.tool || 'caneta',
        color: patch.color || '#ff3b5c',
        size: patch.size || 4,
        pts: [],
        born: performance.now(),
      };
      layer.strokes.set(patch.id, stroke);
    }

    if (patch.replace) stroke.pts = patch.pts ?? [];
    else stroke.pts.push(...(patch.pts ?? []));
    stroke.born = performance.now();
  }

  clear(targetId: string, broadcast = true): void {
    const layer = this.layers.get(this.localTarget(targetId));
    layer?.strokes.clear();
    if (broadcast) tell('annot:clear', { target: this.wireTarget(targetId) });
  }

  /** `'local'` → o meu sid, que é como os outros me conhecem. */
  private wireTarget(targetId: string): string {
    return targetId === 'local' ? voice.mySid : targetId;
  }

  /** O meu sid vindo de fora é a minha própria tela, ou seja, `'local'`. */
  private localTarget(target: string): string {
    return target === voice.mySid ? 'local' : target;
  }

  /* --------------------------------------------------------- desenho --- */

  private loop(): void {
    const tick = () => {
      const fade = Number(settings().annotFade) || 0;
      const now = performance.now();
      for (const layer of this.layers.values()) {
        if (layer.host.isConnected) this.paint(layer, now, fade);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private paint(layer: Layer, now: number, fade: number): void {
    const { canvas, ctx, host } = layer;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;

    // Limitado a 2: acima disso o ganho visual é nulo e o custo, real.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const rect = contentRect(host, layer.video());
    for (const [id, stroke] of layer.strokes) {
      const alpha = fadeAlpha(stroke, now, fade);
      if (alpha === null) {
        layer.strokes.delete(id); // morreu de velho
        continue;
      }
      paintStroke(ctx, stroke, rect, alpha);
    }
    ctx.globalAlpha = 1;
  }
}

export const annot = new AnnotEngine();
