/**
 * Ponte com o app desktop (Electron). No navegador `window.desktop` não
 * existe, então tudo aqui degrada para "não disponível" em vez de quebrar.
 *
 * A forma da ponte está congelada em docs/CONTRATO.md — o preload do 3.x
 * continua compatível com este arquivo.
 */

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  isScreen: boolean;
}

export interface ScreenChoice {
  id: string;
  audio: boolean;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'current'
  | 'error';

export interface ReleaseInfo {
  version: string;
  releaseName: string | null;
  releaseDate: string | null;
  /** Notas da versão, já sem HTML. */
  notes: string;
}

export interface UpdateState {
  status: UpdateStatus;
  info: ReleaseInfo | null;
  progress: { percent: number; transferred: number; total: number; speed: number } | null;
  error: string | null;
  /** `false` quando esta instalação não pode se atualizar sozinha. */
  can: boolean;
  /** `'dev'` (rodando do código-fonte) ou `'portable'`. */
  reason: string | null;
  /** A versão instalada agora. */
  current: string;
}

export interface DesktopInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  dataDir: string;
  serverUrlOverride: string;
}

export interface DesktopBridge {
  isDesktop: true;
  getConfig(): Promise<Record<string, unknown>>;
  setConfig(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  info(): Promise<DesktopInfo>;
  restart(): Promise<void>;
  goHome(): Promise<void>;
  openExternal(url: string): Promise<void>;
  focusWindow(): Promise<void>;
  onPickScreen(fn: (sources: ScreenSource[]) => Promise<ScreenChoice | null>): void;
  retryScreenShareWithoutAudio(): Promise<boolean>;
  update: {
    state(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<UpdateState>;
    install(): Promise<void>;
    onChange(fn: (state: UpdateState) => void): void;
  };
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

/** `true` só dentro do app instalado. */
export const isDesktop = (): boolean => Boolean(window.desktop?.isDesktop);

/** A ponte, ou `null` no navegador. Use sempre com `?.`. */
export const desktop = (): DesktopBridge | null => window.desktop ?? null;
