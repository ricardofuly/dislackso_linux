'use strict';

/**
 * Ponte da janela de desenvolvedor — isolada do preload da janela principal
 * de propósito: nenhum desses IPCs fica acessível pra página normal do app.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopDev', {
  auth: (password) => ipcRenderer.invoke('dev:auth', password),
  changePassword: (current, next) => ipcRenderer.invoke('dev:changePassword', { current, next }),

  getConfig: () => ipcRenderer.invoke('dev:getConfig'),
  setConfig: (patch) => ipcRenderer.invoke('dev:setConfig', patch),
  appInfo: () => ipcRenderer.invoke('dev:appInfo'),
  openDataFolder: () => ipcRenderer.invoke('dev:openDataFolder'),
  clearLocalData: () => ipcRenderer.invoke('dev:clearLocalData'),

  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
  },
});
