import type { AnnotStrokePatch, AnnotTool } from '@/types/api';
import { tell } from '@/lib/socket/client';
import { settings, useSettings } from '@/stores/settings';
import { useSession } from '@/stores/session';
import { voice } from '@/lib/rtc/engine';
import { isDesktop, desktop } from '@/lib/platform';
import { antiGrief } from './antigrief';
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
  private overlayWired = false;

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

    if (isDesktop() && !this.overlayWired) {
      this.overlayWired = true;
      desktop()?.overlay.onActionDraw((stroke) => {
        const patch = stroke as AnnotStrokePatch;
        patch.target = 'local';
        this.applyRemote(patch);
        tell('annot:draw', {
          target: this.wireTarget('local'),
          id: patch.id,
          tool: patch.tool,
          color: patch.color,
          size: patch.size,
          authorName: patch.authorName,
          authorColor: patch.authorColor,
          pts: patch.pts,
          replace: patch.replace,
          end: patch.end,
        });
      });

      desktop()?.overlay.onActionClear(() => {
        this.clear('local');
      });

      desktop()?.overlay.onToolbarHidden((hidden) => {
        useSettings.getState().set('overlayToolbarVisible', !hidden);
      });
    }
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

  applyRemote(patch: AnnotStrokePatch, fromSid = 'unknown'): void {
    const isLocal = this.localTarget(patch.target) === 'local';

    // 1. Se for anotação na minha tela e o recurso estiver desativado nas preferências
    if (isLocal && !settings().annotAllow) {
      return;
    }

    const layer = this.layers.get(this.localTarget(patch.target));
    const currentCount = layer ? layer.strokes.size : 0;

    // 2. Proteção anti-grief no transmissor
    if (isLocal && !antiGrief.validate(patch, currentCount, fromSid)) {
      return;
    }

    if (layer) {
      let stroke = layer.strokes.get(patch.id);
      if (!stroke) {
        stroke = {
          id: patch.id,
          tool: patch.tool || 'caneta',
          color: patch.color || '#ff3b5c',
          size: patch.size || 4,
          authorName: patch.authorName,
          authorColor: patch.authorColor,
          pts: [],
          born: performance.now(),
        };
        layer.strokes.set(patch.id, stroke);
      }
      if (patch.authorName) stroke.authorName = patch.authorName;
      if (patch.authorColor) stroke.authorColor = patch.authorColor;

      if (patch.replace) stroke.pts = patch.pts ?? [];
      else stroke.pts.push(...(patch.pts ?? []));
      stroke.born = performance.now();
    }

    // 3. Sincroniza em tempo real com a janela de overlay transparente no Desktop
    if (isLocal && isDesktop() && voice.screen.active) {
      void desktop()?.overlay.stroke(patch);
    }
  }

  clear(targetId: string, broadcast = true): void {
    const target = this.localTarget(targetId);
    const layer = this.layers.get(target);
    layer?.strokes.clear();
    antiGrief.reset();

    if (target === 'local' && isDesktop()) {
      void desktop()?.overlay.clear();
    }

    if (broadcast) tell('annot:clear', { target: this.wireTarget(targetId) });
  }

  /* ------------------------------------------- controle do overlay desktop -- */

  startOverlay(): void {
    if (isDesktop()) {
      void desktop()?.overlay.start();
      void desktop()?.overlay.setFade(Number(settings().annotFade) || 8);
      const name = useSession.getState().me?.name || 'Você';
      void desktop()?.overlay.setAuthor(name);
      void desktop()?.overlay.setPosition(settings().overlayPosition);
      if (settings().overlayToolbarVisible === false) {
        void desktop()?.overlay.hideToolbar();
      } else {
        void desktop()?.overlay.showToolbar();
      }
    }
  }

  stopOverlay(): void {
    if (isDesktop()) {
      void desktop()?.overlay.clear();
      void desktop()?.overlay.stop();
    }
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
        antiGrief.onStrokeExpired(id);
        continue;
      }
      paintStroke(ctx, stroke, rect, alpha, now);
    }
    ctx.globalAlpha = 1;
  }
}

export const annot = new AnnotEngine();
