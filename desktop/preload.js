'use strict';

/**
 * Ponte entre a interface e o processo principal.
 * A pagina nunca toca em Node diretamente — so nestas funcoes.
 */

const { contextBridge, ipcRenderer } = require('electron');

let screenPicker = null;
let updateListener = null;

ipcRenderer.on('update:state', (_e, state) => {
  if (updateListener) {
    try { updateListener(state); } catch (err) { console.error('[preload] updater:', err); }
  }
});

ipcRenderer.on('screen:pick', async (_e, sources) => {
  let chosen = null;
  try {
    if (screenPicker) chosen = await screenPicker(sources);
  } catch (err) {
    console.error('[preload] seletor de tela falhou:', err);
  }
  ipcRenderer.send('screen:picked', chosen);
});

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,

  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  info: () => ipcRenderer.invoke('app:info'),

  restart: () => ipcRenderer.invoke('app:restart'),
  goHome: () => ipcRenderer.invoke('app:home'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  /**
   * Registra quem mostra o seletor de telas. Recebe a lista de fontes e
   * devolve (via Promise) o id escolhido, ou null para cancelar.
   */
  onPickScreen: (fn) => { screenPicker = fn; },

  /* ---- atualização ---- */
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    /** Recebe cada mudança de estado do processo principal. */
    onChange: (fn) => { updateListener = fn; },
  },
});
