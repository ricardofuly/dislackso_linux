import type { AnnotPoint } from '@/types/api';

export interface ContentRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * O retângulo que o vídeo realmente ocupa dentro do tile.
 *
 * Com `object-fit: contain` sobra barra preta em cima ou nas laterais, e ela
 * precisa ser descontada — senão o rabisco de quem está com a janela larga
 * cai num lugar diferente do de quem está com a janela alta.
 */
export function contentRect(host: HTMLElement, video: HTMLVideoElement | null): ContentRect {
  const w = host.clientWidth;
  const h = host.clientHeight;

  if (!video?.videoWidth || !video.videoHeight || video.classList.contains('hidden')) {
    return { x: 0, y: 0, w, h };
  }

  const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
  const dw = video.videoWidth * scale;
  const dh = video.videoHeight * scale;
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
}

/**
 * Coordenada de tela → coordenada normalizada do quadro de vídeo.
 *
 * É essa normalização que faz o rabisco cair no mesmo pixel da imagem para
 * todo mundo, independente do tamanho da janela de cada um.
 */
export function toNormalized(
  host: HTMLElement,
  video: HTMLVideoElement | null,
  clientX: number,
  clientY: number,
): AnnotPoint {
  const box = host.getBoundingClientRect();
  const r = contentRect(host, video);
  return [(clientX - box.left - r.x) / r.w, (clientY - box.top - r.y) / r.h];
}

/** O inverso: normalizado → pixel dentro do tile, para desenhar. */
export function toPixels(rect: ContentRect, point: AnnotPoint): [number, number] {
  return [rect.x + point[0] * rect.w, rect.y + point[1] * rect.h];
}
