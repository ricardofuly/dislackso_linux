/**
 * De onde o app fala com o servidor.
 *
 * Três cenários, nesta ordem de prioridade:
 *   1. `window.ENV.SERVER_URL` — escape hatch de quem hospeda o próprio
 *      servidor: basta um `<script>` antes do bundle. É o mesmo mecanismo do
 *      3.x, mantido de propósito para não quebrar instalações existentes.
 *   2. app desktop — a página vem de `file://`, então não existe "mesma
 *      origem": precisa de um endereço absoluto.
 *   3. web — mesma origem. A página foi servida pelo próprio servidor.
 */

declare global {
  interface Window {
    ENV?: { SERVER_URL?: string };
  }
}

const DEFAULT_DESKTOP_SERVER = 'https://dislackso.onrender.com';

let override: string | null = null;

/** O painel de desenvolvedor do app pode apontar para outro servidor. */
export function setServerUrlOverride(url: string): void {
  override = url.replace(/\/$/, '');
}

export function serverUrl(): string {
  if (override) return override;
  const fromPage = window.ENV?.SERVER_URL;
  if (fromPage) return fromPage.replace(/\/$/, '');
  return __DESKTOP_BUILD__ ? DEFAULT_DESKTOP_SERVER : '';
}

/**
 * Base para montar links de convite. No navegador `location.origin` já é o
 * endereço certo; no desktop a página é `file://` e ele não serve para nada.
 */
export function inviteOrigin(): string {
  return serverUrl() || window.location.origin;
}

/** Converte `/uploads/x.png` no endereço completo do arquivo. */
export function assetUrl(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl) return '';
  if (pathOrUrl.startsWith('data:') || pathOrUrl.startsWith('http')) return pathOrUrl;
  return serverUrl() + pathOrUrl;
}

export const APP_VERSION = __APP_VERSION__;
