import type { AnnotPoint, AnnotTool } from '@/types/api';
import { toPixels, type ContentRect } from './geometry';

/** Um traço já montado, do jeito que fica em memória enquanto é desenhado. */
export interface Stroke {
  id: string;
  tool: AnnotTool;
  color: string;
  size: number;
  pts: AnnotPoint[];
  /** `performance.now()` do último ponto — é daqui que sai o desaparecimento. */
  born: number;
}

/** Como cada ferramenta se comporta no traço. */
const TOOL_SPEC: Record<AnnotTool, { width: number; alpha: number; cap: CanvasLineCap }> = {
  caneta: { width: 1, alpha: 1, cap: 'round' },
  marcador: { width: 3.2, alpha: 0.38, cap: 'round' },
  seta: { width: 1.2, alpha: 1, cap: 'round' },
};

/** Só começa a sumir no último terço da vida — antes disso fica em opacidade cheia. */
const FADE_START_RATIO = 0.65;

/**
 * Opacidade de um traço pela idade, ou `null` quando ele já morreu e deve
 * sair da lista. `fade` em 0 significa "nunca sumir".
 */
export function fadeAlpha(stroke: Stroke, now: number, fade: number): number | null {
  if (fade <= 0) return 1;
  const age = (now - stroke.born) / 1000;
  if (age > fade) return null;

  const start = fade * FADE_START_RATIO;
  return age > start ? 1 - (age - start) / (fade - start) : 1;
}

export function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  rect: ContentRect,
  alpha: number,
): void {
  const spec = TOOL_SPEC[stroke.tool] ?? TOOL_SPEC.caneta;
  ctx.globalAlpha = alpha * spec.alpha;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size * spec.width;
  ctx.lineCap = spec.cap;
  ctx.lineJoin = 'round';

  if (stroke.tool === 'seta') drawArrow(ctx, stroke.pts, rect);
  else drawFreehand(ctx, stroke.pts, rect);
}

function drawFreehand(ctx: CanvasRenderingContext2D, pts: AnnotPoint[], rect: ContentRect): void {
  if (!pts.length) return;

  if (pts.length === 1) {
    const [x, y] = toPixels(rect, pts[0]!);
    ctx.beginPath();
    ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  const [x0, y0] = toPixels(rect, pts[0]!);
  ctx.moveTo(x0, y0);

  // Curva por pontos médios: tira o serrilhado do traço feito à mão.
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = toPixels(rect, pts[i]!);
    const [nx, ny] = toPixels(rect, pts[i + 1]!);
    ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
  }

  const [lx, ly] = toPixels(rect, pts[pts.length - 1]!);
  ctx.lineTo(lx, ly);
  ctx.stroke();
}

function drawArrow(ctx: CanvasRenderingContext2D, pts: AnnotPoint[], rect: ContentRect): void {
  if (pts.length < 2) return;
  const [x1, y1] = toPixels(rect, pts[0]!);
  const [x2, y2] = toPixels(rect, pts[1]!);
  const head = Math.max(12, ctx.lineWidth * 3.5);
  const angle = Math.atan2(y2 - y1, x2 - x1);

  // A haste para um pouco antes da ponta, senão ela aparece por dentro dela.
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(angle) * head * 0.6, y2 - Math.sin(angle) * head * 0.6);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}
