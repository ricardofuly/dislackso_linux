const path = require('path');
const { BrowserWindow, screen, ipcMain } = require('electron');

let canvasWin = null;
let toolbarWin = null;
let mainWindowGetter = null;
let currentPosition = 'top-right';
let isToolbarCollapsed = false;

function setMainWindowGetter(fn) {
  mainWindowGetter = fn;
}

function calculateToolbarBounds() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  const w = isToolbarCollapsed ? 52 : 480;
  const h = isToolbarCollapsed ? 52 : 56;
  let posX = x + width - (isToolbarCollapsed ? 70 : 500);
  let posY = y + 20;

  switch (currentPosition) {
    case 'top-left':
      posX = x + 20;
      posY = y + 20;
      break;
    case 'top-center':
      posX = x + Math.round((width - w) / 2);
      posY = y + 20;
      break;
    case 'bottom-center':
      posX = x + Math.round((width - w) / 2);
      posY = y + height - h - 20;
      break;
    case 'top-right':
    default:
      posX = x + width - (isToolbarCollapsed ? 70 : 500);
      posY = y + 20;
      break;
  }

  return { x: posX, y: posY, width: w, height: h };
}

function applyToolbarBounds() {
  if (!toolbarWin || toolbarWin.isDestroyed()) return;
  const bounds = calculateToolbarBounds();
  toolbarWin.setBounds(bounds);
}

// Sincroniza estado das ferramentas entre a toolbar e o canvas
ipcMain.on('overlay:sync-state', (_e, state) => {
  if (canvasWin && !canvasWin.isDestroyed()) {
    canvasWin.webContents.send('overlay:set-tool-state', state);
    const isDrawing = Boolean(state?.drawing);
    try {
      canvasWin.setIgnoreMouseEvents(!isDrawing, { forward: true });
    } catch {
      canvasWin.setIgnoreMouseEvents(!isDrawing);
    }
  }
});

// Redimensiona a janela da toolbar quando expande / colapsa
ipcMain.on('overlay:resize-toolbar', (_e, { collapsed }) => {
  isToolbarCollapsed = Boolean(collapsed);
  applyToolbarBounds();
});

// Oculta a toolbar a pedido do usuário
ipcMain.on('overlay:hide-toolbar', () => {
  if (toolbarWin && !toolbarWin.isDestroyed()) {
    toolbarWin.hide();
  }
  const win = mainWindowGetter?.();
  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send('annot:toolbar-hidden', true);
  }
});

ipcMain.on('overlay:action-draw', (_e, stroke) => {
  const win = mainWindowGetter?.();
  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send('annot:action-draw', stroke);
  }
});

ipcMain.on('overlay:action-clear', () => {
  if (canvasWin && !canvasWin.isDestroyed()) {
    canvasWin.webContents.send('overlay:clear');
  }
  const win = mainWindowGetter?.();
  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send('annot:action-clear');
  }
});

/**
 * Abre a janela de canvas (tela cheia) e a barra de ferramentas flutuante dedicada.
 */
function openOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.bounds;

  // 1. Janela Fullscreen do Canvas de Anotações (Click-Through por padrão)
  if (!canvasWin || canvasWin.isDestroyed()) {
    canvasWin = new BrowserWindow({
      x,
      y,
      width,
      height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      resizable: false,
      show: false,
      enableLargerThanScreen: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    try { canvasWin.setAlwaysOnTop(true, 'screen-saver'); } catch { canvasWin.setAlwaysOnTop(true); }
    canvasWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    try { canvasWin.setIgnoreMouseEvents(true, { forward: true }); } catch { canvasWin.setIgnoreMouseEvents(true); }

    canvasWin.loadFile(path.join(__dirname, 'overlay-canvas.html'));

    canvasWin.once('ready-to-show', () => {
      if (canvasWin && !canvasWin.isDestroyed()) canvasWin.showInactive();
    });

    canvasWin.on('closed', () => { canvasWin = null; });
  } else {
    canvasWin.showInactive();
  }

  // 2. Janela Flutuante da Barra de Ferramentas (Sempre clicável e interativa)
  const tbBounds = calculateToolbarBounds();
  if (!toolbarWin || toolbarWin.isDestroyed()) {
    toolbarWin = new BrowserWindow({
      x: tbBounds.x,
      y: tbBounds.y,
      width: tbBounds.width,
      height: tbBounds.height,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      resizable: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    try { toolbarWin.setAlwaysOnTop(true, 'screen-saver'); } catch { toolbarWin.setAlwaysOnTop(true); }
    toolbarWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    toolbarWin.loadFile(path.join(__dirname, 'overlay-toolbar.html'));

    toolbarWin.once('ready-to-show', () => {
      if (toolbarWin && !toolbarWin.isDestroyed()) toolbarWin.showInactive();
    });

    toolbarWin.on('closed', () => { toolbarWin = null; });
  } else {
    toolbarWin.showInactive();
  }

  return canvasWin;
}

/**
 * Fecha ambas as janelas de overlay.
 */
function closeOverlayWindow() {
  if (canvasWin && !canvasWin.isDestroyed()) {
    canvasWin.close();
    canvasWin = null;
  }
  if (toolbarWin && !toolbarWin.isDestroyed()) {
    toolbarWin.close();
    toolbarWin = null;
  }
}

/**
 * Define a posição da barra no desktop (top-right, top-left, top-center, bottom-center)
 */
function setOverlayPosition(pos) {
  if (['top-right', 'top-left', 'top-center', 'bottom-center'].includes(pos)) {
    currentPosition = pos;
    applyToolbarBounds();
  }
}

/**
 * Mostra a toolbar do desktop caso tenha sido ocultada.
 */
function showOverlayToolbar() {
  if (toolbarWin && !toolbarWin.isDestroyed()) {
    applyToolbarBounds();
    toolbarWin.showInactive();
  } else {
    openOverlayWindow();
  }
}

/**
 * Oculta a toolbar do desktop.
 */
function hideOverlayToolbar() {
  if (toolbarWin && !toolbarWin.isDestroyed()) {
    toolbarWin.hide();
  }
}

/**
 * Envia dados de traço para a janela de canvas.
 */
function sendStrokeToOverlay(stroke) {
  if (!canvasWin || canvasWin.isDestroyed()) {
    openOverlayWindow();
  }

  if (canvasWin && !canvasWin.isDestroyed() && canvasWin.webContents) {
    canvasWin.webContents.send('overlay:stroke', stroke);
  }
}

/**
 * Limpa todos os traços do canvas.
 */
function clearOverlay() {
  if (canvasWin && !canvasWin.isDestroyed()) {
    canvasWin.webContents.send('overlay:clear');
  }
}

/**
 * Atualiza o tempo de fade no canvas.
 */
function setOverlayFade(fadeSeconds) {
  if (canvasWin && !canvasWin.isDestroyed() && canvasWin.webContents) {
    canvasWin.webContents.send('overlay:fade', fadeSeconds);
  }
}

/**
 * Envia o nome do autor local para o canvas.
 */
function setOverlayAuthor(name) {
  if (canvasWin && !canvasWin.isDestroyed() && canvasWin.webContents) {
    canvasWin.webContents.send('overlay:author', name);
  }
}

module.exports = {
  setMainWindowGetter,
  openOverlayWindow,
  closeOverlayWindow,
  setOverlayPosition,
  showOverlayToolbar,
  hideOverlayToolbar,
  sendStrokeToOverlay,
  clearOverlay,
  setOverlayFade,
  setOverlayAuthor,
};
