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
  if (code === 'Escape') return 'Esc';
  if (code === 'Backspace') return 'Backspace';
  if (code === 'Enter') return 'Enter';
  if (code === 'Tab') return 'Tab';
  if (code === 'Delete') return 'Del';
  if (code === 'Insert') return 'Ins';
  if (code === 'Home') return 'Home';
  if (code === 'End') return 'End';
  if (code === 'PageUp') return 'PgUp';
  if (code === 'PageDown') return 'PgDn';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `Seta ${code.slice(5).toLowerCase()}`;
  return code.replace(/(Left|Right)$/, ' $1').replace('Control', 'Ctrl');
}

/** Formata uma combinação de teclas serializada (ex.: "Ctrl+Alt+KeyM" ou "KeyS") para exibição amigável. */
export function formatShortcut(bind: string): string {
  if (!bind) return '—';
  const parts = bind.split('+');
  const code = parts[parts.length - 1] ?? '';
  const modifiers = parts.slice(0, -1);
  return [...modifiers, keyLabel(code)].join(' + ');
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

/** Captura a combinação de teclas de um evento de teclado para rebind. Retorna null se for apenas modificador solto. */
export function captureShortcut(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  parts.push(e.code);

  return parts.join('+');
}

/** Verifica se um KeyboardEvent corresponde a um atalho configurado. */
export function shortcutMatches(e: KeyboardEvent, bind: string): boolean {
  if (!bind) return false;
  const parts = bind.split('+');
  const code = parts[parts.length - 1] ?? '';
  const hasCtrl = parts.includes('Ctrl');
  const hasAlt = parts.includes('Alt');
  const hasShift = parts.includes('Shift');
  const hasMeta = parts.includes('Meta');

  return (
    e.code === code &&
    e.ctrlKey === hasCtrl &&
    e.altKey === hasAlt &&
    e.shiftKey === hasShift &&
    e.metaKey === hasMeta
  );
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
