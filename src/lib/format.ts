/** Formatações curtas usadas na interface inteira. */

export function initials(name: string | undefined | null): string {
  return String(name ?? '').trim().slice(0, 2).toUpperCase() || '??';
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function bytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Nome legível de um `KeyboardEvent.code`, para mostrar a tecla do PTT. */
export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code === 'Space') return 'Espaço';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `Seta ${code.slice(5).toLowerCase()}`;
  return code.replace(/(Left|Right)$/, ' $1').replace('Control', 'Ctrl');
}

const RGB_FALLBACK = { r: 88, g: 101, b: 242 };

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m?.[1]) return RGB_FALLBACK;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Preto ou branco — o que lê melhor sobre a cor dada. */
export function contrastOn(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#111214' : '#ffffff';
}
