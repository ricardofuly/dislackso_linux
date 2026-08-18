'use strict';

/**
 * Traz sessão e preferências da origem antiga (`file://`) para a nova (`app://`).
 *
 * Até a 3.x a interface era carregada direto do disco, então o localStorage
 * ficou gravado na origem `file://`. A 4.0 serve a interface por `app://`
 * (ver app-protocol.js), e o Chromium separa armazenamento por origem — sem
 * esta migração, atualizar o app deslogaria todo mundo e zeraria o tema.
 *
 * Roda uma vez só, numa janela invisível, e é totalmente opcional: se
 * qualquer passo falhar, o app abre normalmente e a pessoa entra de novo.
 */

const path = require('path');
const { BrowserWindow } = require('electron');

/** Só as chaves do app; o que mais estiver ali não é nosso. */
const PREFIX = 'dsx:';
const LEGACY_PREFIX = 'd2:';
const READ_TIMEOUT_MS = 5000;

/** Lê o localStorage da origem `file://` através de uma janela invisível. */
async function readLegacyStorage() {
  const probe = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  try {
    await probe.loadFile(path.join(__dirname, 'legacy-bridge.html'));
    const raw = await Promise.race([
      probe.webContents.executeJavaScript('JSON.stringify(window.localStorage)'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), READ_TIMEOUT_MS)),
    ]);
    const all = JSON.parse(raw || '{}');
    return Object.fromEntries(
      Object.entries(all).filter(([k]) => k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX)),
    );
  } finally {
    if (!probe.isDestroyed()) probe.destroy();
  }
}

/**
 * Copia as chaves para a janela já carregada, sem sobrescrever nada que a
 * nova origem tenha. Se a pessoa já entrou na 4.0, o que vale é o que ela fez
 * agora, não o que estava guardado antes.
 */
async function writeInto(webContents, entries) {
  const payload = JSON.stringify(entries);
  await webContents.executeJavaScript(`
    (() => {
      const data = ${payload};
      let copied = 0;
      for (const [key, value] of Object.entries(data)) {
        if (localStorage.getItem(key) === null) {
          localStorage.setItem(key, value);
          copied++;
        }
      }
      return copied;
    })()
  `);
}

/**
 * @param {Electron.WebContents} webContents a janela principal, já carregada
 * @param {{ done: boolean, markDone: () => void }} flag persistência do "já migrei"
 */
async function migrateLegacyStorage(webContents, flag) {
  if (flag.done) return;

  try {
    const entries = await readLegacyStorage();
    if (Object.keys(entries).length) {
      await writeInto(webContents, entries);
      console.log(`[migrate] ${Object.keys(entries).length} chaves trazidas da origem antiga`);
      // A sessão só passa a valer no próximo boot: o app já leu o
      // localStorage (vazio) quando montou.
      webContents.reload();
    }
  } catch (err) {
    console.warn('[migrate] não consegui ler o armazenamento antigo:', err.message);
  } finally {
    // Marca como feita mesmo em caso de falha: tentar a cada boot só atrasaria
    // a abertura para sempre, e o custo de não migrar é entrar de novo uma vez.
    flag.markDone();
  }
}

module.exports = { migrateLegacyStorage };
