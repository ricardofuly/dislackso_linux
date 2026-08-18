'use strict';

/**
 * Processo principal do DiSlackso Desktop.
 *
 * Dois modos, escolhidos no lancador:
 *   - Hospedar : sobe o servidor dentro deste processo; seu PC vira o servidor.
 *   - Conectar : aponta para um servidor que ja existe (de um amigo ou na nuvem).
 *
 * O que o desktop ganha sobre o navegador:
 *   - seletor de tela proprio, com miniaturas;
 *   - audio do sistema (loopback) no Windows, sem depender da caixinha do Chrome;
 *   - controle de aceleracao de hardware e transparencia da janela.
 */

const { app, BrowserWindow, ipcMain, session, desktopCapturer, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const DEFAULT_DEV_PASSWORD = 'dislackso-dev';
const DEFAULT_SERVER_URL = 'https://dislackso.onrender.com'; // mesmo padrão de public/js/config.js

/** Mesmo esquema de server/index.js (scrypt builtin, sem dependência nativa). */
function hashSecret(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(value), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifySecret(value, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(value || ''), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return check.length === expected.length && crypto.timingSafeEqual(check, expected);
}

const DEFAULTS = {
  mode: null,                  // 'host' | 'connect'
  url: '',
  port: 3000,
  hardwareAcceleration: true,
  transparency: false,
  lastHostTunnel: false,
  devPasswordHash: '',         // preenchido no primeiro boot, ver abaixo
  serverUrlOverride: '',       // definido pelo painel de desenvolvedor
  adminKey: '',                 // pra mandar avisos — precisa bater com ADMIN_KEY no Render
};

/* ------------------------------------------------------------ config --- */

function readConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error('[config] falha ao gravar:', err.message);
  }
  return next;
}

let config = readConfig();
if (!config.devPasswordHash) {
  config = writeConfig({ devPasswordHash: hashSecret(DEFAULT_DEV_PASSWORD) });
}

// Precisa acontecer antes do app ficar pronto.
if (!config.hardwareAcceleration) app.disableHardwareAcceleration();

/* ------------------------------------------------------------ estado --- */

let win = null;
let devWin = null;
let devWinAuthed = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

/* ------------------------------------------------------------- janela -- */

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    transparent: !!config.transparency,
    backgroundColor: config.transparency ? '#00000000' : '#1a1b1e',
    ...(config.transparency && process.platform === 'win32' ? { backgroundMaterial: 'acrylic' } : {}),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1a1b1e', symbolColor: '#dbdee1', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.show();
  win.on('closed', () => { win = null; });

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Atalhos de desenvolvedor continuam disponiveis para diagnostico.
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
    }
    if (input.control && input.key.toLowerCase() === 'r') win.webContents.reload();
    if (input.control && input.alt && input.shift && input.key.toLowerCase() === 'd') openDevWindow();
  });

  goHome();
}

function goHome() {
  if (win) win.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
}

/* --------------------------------------------------- janela dev ------- */

/** Atalho Ctrl+Alt+Shift+D na janela principal. Senha própria, isolada por preload. */
function openDevWindow() {
  if (devWin) { devWin.focus(); return; }
  devWinAuthed = false;
  devWin = new BrowserWindow({
    width: 720,
    height: 780,
    minWidth: 520,
    minHeight: 480,
    backgroundColor: '#1a1b1e',
    title: 'DiSlackso — Desenvolvedor',
    webPreferences: {
      preload: path.join(__dirname, 'dev-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  devWin.setMenuBarVisibility(false);
  devWin.loadFile(path.join(__dirname, 'dev-window.html'));
  devWin.on('closed', () => { devWin = null; devWinAuthed = false; });
}

/* -------------------------------------------------- seletor de tela --- */

let pickResolver = null;
let lastSourceId = null;    // pra repetir sem áudio sem reabrir o seletor
let forceNoAudioNext = false;

/** Pede ao renderer que mostre nosso seletor e devolva a fonte + preferência de áudio. */
function askRendererToPick(sources) {
  return new Promise((resolve) => {
    if (!win) return resolve(null);
    pickResolver = resolve;
    win.webContents.send('screen:pick', sources);
    // Se o renderer nao responder, nao deixa a promessa pendurada para sempre.
    setTimeout(() => { if (pickResolver === resolve) { pickResolver = null; resolve(null); } }, 120000);
  });
}

ipcMain.on('screen:picked', (_e, picked) => {
  const resolve = pickResolver;
  pickResolver = null;
  if (resolve) resolve(picked || null);
});

/**
 * Chamado pelo renderer quando a captura com áudio falhou (ex.: "Could not
 * start audio source" — driver de áudio que não sustenta loopback). Faz o
 * próximo pedido de captura repetir a MESMA fonte já escolhida, mas sem
 * pedir áudio, sem abrir o seletor de novo.
 */
ipcMain.handle('screen:retryNoAudio', () => {
  forceNoAudioNext = !!lastSourceId;
  return forceNoAudioNext;
});

function installDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true,
      });

      let source;
      let wantAudio;

      if (forceNoAudioNext && lastSourceId) {
        forceNoAudioNext = false;
        source = sources.find((s) => s.id === lastSourceId);
        wantAudio = false;
      } else {
        const payload = sources.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.id.startsWith('screen') ? 'screen' : 'window',
          thumbnail: s.thumbnail.toDataURL(),
          icon: s.appIcon ? s.appIcon.toDataURL() : null,
        }));

        const picked = await askRendererToPick(payload);
        if (!picked || !picked.id) return callback(null);
        source = sources.find((s) => s.id === picked.id);
        wantAudio = picked.audio !== false;
        lastSourceId = picked.id;
      }
      if (!source) return callback(null);

      // 'loopback' captura o audio do sistema, mas só funciona junto de uma
      // tela inteira — pedir áudio ao capturar uma janela específica falha
      // com "Could not start audio source" (limitação do WASAPI loopback,
      // que não sabe isolar o som de uma janela só). Também respeita a
      // escolha do usuário no seletor (compartilhar com ou sem áudio).
      const isFullScreen = source.id.startsWith('screen:');
      const includeAudio = process.platform === 'win32' && isFullScreen && wantAudio;
      callback(includeAudio ? { video: source, audio: 'loopback' } : { video: source });
    } catch (err) {
      console.error('[captura]', err);
      try { callback(null); } catch {}
    }
  }, { useSystemPicker: false });
}



/* ------------------------------------------------------- atualização -- */

/**
 * Atualização automática pelos releases do GitHub.
 *
 * O electron-builder publica um `latest.yml` junto do instalador; é ele que
 * o electron-updater lê para saber a versão mais nova. O download aproveita
 * o `.blockmap` e baixa só os pedaços que mudaram — costuma ser alguns MB
 * em vez dos 79 do instalador inteiro.
 *
 * Nada acontece sozinho: quem manda baixar e quem manda reiniciar é o
 * usuário, pela tela de atualização.
 */
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.logger = null;

let updateState = { status: 'idle', info: null, progress: null, error: null };

/** A versão portátil não tem instalador para rodar. */
const isPortableBuild = () => fs.existsSync(path.join(process.resourcesPath || '', 'PORTABLE'));

function updateCapability() {
  if (!app.isPackaged && !process.env.DISLACKSO_DEV_UPDATE) {
    return { can: false, reason: 'dev' };
  }
  if (isPortableBuild()) return { can: false, reason: 'portable' };
  return { can: true, reason: null };
}

/** Só o que a interface precisa — o objeto do updater é grande e cheio de ruído. */
function slimInfo(info) {
  if (!info) return null;
  let notes = info.releaseNotes;
  if (Array.isArray(notes)) notes = notes.map((n) => n.note || '').join('\n\n');
  if (typeof notes !== 'string') notes = '';
  // Vem como HTML do GitHub; a interface mostra como texto puro.
  notes = notes.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
  return {
    version: info.version,
    releaseName: info.releaseName || null,
    releaseDate: info.releaseDate || null,
    notes,
  };
}

function pushUpdate(patch) {
  updateState = { ...updateState, ...patch };
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:state', { ...updateState, ...updateCapability(), current: app.getVersion() });
  }
}

autoUpdater.on('checking-for-update', () => pushUpdate({ status: 'checking', error: null }));
autoUpdater.on('update-available', (info) => pushUpdate({ status: 'available', info: slimInfo(info), error: null }));
autoUpdater.on('update-not-available', (info) => pushUpdate({ status: 'current', info: slimInfo(info), error: null }));
autoUpdater.on('update-downloaded', (info) => pushUpdate({ status: 'ready', info: slimInfo(info), progress: null }));
autoUpdater.on('download-progress', (p) => pushUpdate({
  status: 'downloading',
  progress: {
    percent: Math.max(0, Math.min(100, p.percent || 0)),
    transferred: p.transferred || 0,
    total: p.total || 0,
    speed: p.bytesPerSecond || 0,
  },
}));
autoUpdater.on('error', (err) => {
  const msg = String((err && err.message) || err);
  // A mensagem crua do updater é técnica demais para a tela.
  let amigavel = msg;
  if (/releases\.atom|404/.test(msg)) {
    // O 404 aqui quase sempre é repositório privado: sem autenticação o
    // GitHub responde 404 em vez de 403, para não revelar que ele existe.
    amigavel = 'Não consegui ler os releases no GitHub. Se o repositório for privado, '
             + 'a atualização automática não funciona — ele precisa ser público.';
  } else if (/net::|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET/.test(msg)) {
    amigavel = 'Sem conexão com o GitHub. Tente de novo mais tarde.';
  } else if (/sha512|checksum/i.test(msg)) {
    amigavel = 'O arquivo baixado veio corrompido. Tente de novo.';
  } else if (/ENOSPC/.test(msg)) {
    amigavel = 'Sem espaço em disco para baixar a atualização.';
  }
  pushUpdate({ status: 'error', error: amigavel });
});

/* ---------------------------------------------------------------- IPC -- */

ipcMain.handle('config:get', () => readConfig());
ipcMain.handle('config:set', (_e, patch) => writeConfig(patch || {}));

function buildAppInfo() {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    dataDir: path.join(app.getPath('userData'), 'data'),
    hosting: false,
    hostInfo: null,
    tunnelUrl: '',
    serverUrlOverride: readConfig().serverUrlOverride || '',
  };
}

ipcMain.handle('app:restart', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('app:home', () => { goHome(); });
ipcMain.handle('app:info', () => buildAppInfo());

/* ------------------------------------------------ painel de dev — IPC -- */

function requireDevAuth() {
  if (!devWinAuthed) throw new Error('não autenticado no painel de desenvolvedor');
}

ipcMain.handle('dev:auth', (_e, password) => {
  devWinAuthed = verifySecret(password, readConfig().devPasswordHash);
  return devWinAuthed;
});

ipcMain.handle('dev:changePassword', (_e, { current, next } = {}) => {
  requireDevAuth();
  if (!verifySecret(current, readConfig().devPasswordHash)) return { ok: false, error: 'Senha atual incorreta.' };
  if (!next || String(next).length < 6) return { ok: false, error: 'A nova senha precisa ter pelo menos 6 caracteres.' };
  writeConfig({ devPasswordHash: hashSecret(next) });
  return { ok: true };
});

ipcMain.handle('dev:getConfig', () => { requireDevAuth(); return readConfig(); });
ipcMain.handle('dev:setConfig', (_e, patch) => { requireDevAuth(); return writeConfig(patch || {}); });
ipcMain.handle('dev:appInfo', () => { requireDevAuth(); return buildAppInfo(); });

ipcMain.handle('dev:openDataFolder', () => {
  requireDevAuth();
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});

ipcMain.handle('dev:clearLocalData', async () => {
  requireDevAuth();
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'cookies', 'cachestorage'] });
  if (win && !win.isDestroyed()) win.reload();
  return true;
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(url);
});

/** Traz a janela principal pra frente — usado quando chega um aviso de admin com "forçar foco". */
ipcMain.handle('app:focus', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (app.dock) app.dock.bounce('informational');
});

/** Manda o aviso pra todo mundo conectado, via o servidor (o painel de dev não tem sessão de usuário). */
ipcMain.handle('dev:broadcast', async (_e, { message, forceFocus } = {}) => {
  requireDevAuth();
  const cfg = readConfig();
  if (!cfg.adminKey) return { ok: false, error: 'Defina a chave de admin primeiro (precisa bater com ADMIN_KEY no Render).' };
  const base = cfg.serverUrlOverride || DEFAULT_SERVER_URL;
  try {
    const res = await fetch(`${base}/api/admin/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: cfg.adminKey, message, forceFocus: !!forceFocus }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || `HTTP ${res.status}` };
    return { ok: true, delivered: json.delivered };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('update:state', () => ({
  ...updateState, ...updateCapability(), current: app.getVersion(),
}));

ipcMain.handle('update:check', async () => {
  const cap = updateCapability();
  if (!cap.can) {
    pushUpdate({ status: 'blocked', error: null });
    return { ...updateState, ...cap, current: app.getVersion() };
  }
  try {
    // Em desenvolvimento só funciona com o dev-app-update.yml presente.
    if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;
    await autoUpdater.checkForUpdates();
  } catch (err) {
    pushUpdate({ status: 'error', error: String(err.message || err) });
  }
  return { ...updateState, ...cap, current: app.getVersion() };
});

ipcMain.handle('update:download', async () => {
  if (!updateCapability().can) return false;
  try {
    pushUpdate({ status: 'downloading', progress: { percent: 0, transferred: 0, total: 0, speed: 0 } });
    await autoUpdater.downloadUpdate();
    return true;
  } catch (err) {
    pushUpdate({ status: 'error', error: String(err.message || err) });
    return false;
  }
});

ipcMain.handle('update:install', () => {
  // isSilent=false mostra o instalador; isForceRunAfter=true reabre o app.
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
});

ipcMain.handle('dialog:pickFolder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

/* -------------------------------------------------------------- ciclo -- */

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  installDisplayMediaHandler();

  // Microfone e camera sao concedidos localmente: quem pede e a nossa propria UI.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
  });

  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
