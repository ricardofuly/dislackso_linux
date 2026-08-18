/* ==========================================================================
   settings.js — preferências do usuário e sua aplicação no documento
   ========================================================================== */

'use strict';

const THEMES = [
  { id: 'escuro',     name: 'Escuro',      colors: ['#17181b', '#2b2d31', '#313338'] },
  { id: 'meianoite',  name: 'Meia-noite',  colors: ['#000000', '#101114', '#1e1f24'] },
  { id: 'nebula',     name: 'Nébula',      colors: ['#14121f', '#221d34', '#322a4f'] },
  { id: 'claro',      name: 'Claro',       colors: ['#e3e5e8', '#f7f8f9', '#ffffff'] },
];

const ACCENTS = ['#5865f2', '#3ba55c', '#eb459e', '#faa61a', '#ed4245', '#00a8fc', '#9b59b6', '#1abc9c'];

const DEFAULT_SETTINGS = {
  // aparência
  theme: 'escuro',
  accent: '#5865f2',
  radius: 1,
  glass: 0.74,

  // movimento
  motion: 'on',
  motionSpeed: 1,
  gpu: 'on',

  // transmissão
  quality: '1080p60',
  contentHint: 'motion',
  autoFocus: true,
  selfPreview: true,
  shareSystemAudio: true,

  // áudio
  micId: '',
  speakerId: '',
  micGain: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  micMode: 'voz',          // 'voz' | 'ptt'
  pttKey: 'Space',
  duckVoiceOnShare: true,

  // aplicativo
  autoUpdate: true,
  feedbackSounds: true,

  // anotações
  annotAllow: true,
  annotFade: 8,            // segundos; 0 = não some
  annotColor: '#ff3b5c',
  annotSize: 4,
};

const Settings = {
  values: { ...DEFAULT_SETTINGS, ...(LS.get('settings') || {}) },
  listeners: new Set(),

  get(key) { return this.values[key]; },

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    LS.set('settings', this.values);
    this.apply();
    for (const fn of this.listeners) {
      try { fn(key, value); } catch (err) { console.error('[settings]', err); }
    }
  },

  patch(obj) {
    for (const [k, v] of Object.entries(obj)) this.set(k, v);
  },

  on(fn) { this.listeners.add(fn); },

  reset() {
    this.values = { ...DEFAULT_SETTINGS };
    LS.set('settings', this.values);
    this.apply();
    for (const fn of this.listeners) fn('*', null);
  },

  /** Escreve as preferências no <html> — daí o CSS faz o resto. */
  apply() {
    const v = this.values;
    const root = document.documentElement;

    root.dataset.theme = v.theme;
    root.dataset.motion = v.motion;
    root.dataset.gpu = v.gpu;
    if (isDesktop()) root.dataset.desktop = '1';

    root.style.setProperty('--accent', v.accent);
    root.style.setProperty('--accent-soft', hexToRgba(v.accent, 0.16));
    root.style.setProperty('--accent-fg', contrastOn(v.accent));
    root.style.setProperty('--radius-scale', String(v.radius));
    root.style.setProperty('--glass-alpha', String(v.glass));
    root.style.setProperty('--speed', v.motion === 'off' ? '0.001' : String(v.motionSpeed));
  },
};

/* ------------------------------------------------------------- cores --- */

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return { r: 88, g: 101, b: 242 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Preto ou branco, o que ler melhor sobre a cor dada. */
function contrastOn(hex) {
  const { r, g, b } = hexToRgb(hex);
  // luminância relativa aproximada (sRGB)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? '#111214' : '#ffffff';
}

Settings.apply();

window.Settings = Settings;
window.THEMES = THEMES;
window.ACCENTS = ACCENTS;
