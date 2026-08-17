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
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = {
  mode: null,                  // 'host' | 'connect'
  url: '',
  port: 3000,
  hardwareAcceleration: true,
  transparency: false,
  lastHostTunnel: false,
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

const config = readConfig();

// Precisa acontecer antes do app ficar pronto.
if (!config.hardwareAcceleration) app.disableHardwareAcceleration();

/* ------------------------------------------------------------ estado --- */

let win = null;
let hosted = null;      // instancia do servidor embutido
let tunnel = null;      // processo do cloudflared
let tunnelUrl = '';

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

  win.once('ready-to-show', () => win.show());
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
  });

  goHome();
}

function goHome() {
  if (win) win.loadFile(path.join(__dirname, 'launcher.html'));
}

/* -------------------------------------------------- seletor de tela --- */

let pickResolver = null;

/** Pede ao renderer que mostre nosso seletor e devolva a fonte escolhida. */
function askRendererToPick(sources) {
  return new Promise((resolve) => {
    if (!win) return resolve(null);
    pickResolver = resolve;
    win.webContents.send('screen:pick', sources);
    // Se o renderer nao responder, nao deixa a promessa pendurada para sempre.
    setTimeout(() => { if (pickResolver === resolve) { pickResolver = null; resolve(null); } }, 120000);
  });
}

ipcMain.on('screen:picked', (_e, id) => {
  const resolve = pickResolver;
  pickResolver = null;
  if (resolve) resolve(id || null);
});

function installDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true,
      });

      const payload = sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith('screen') ? 'screen' : 'window',
        thumbnail: s.thumbnail.toDataURL(),
        icon: s.appIcon ? s.appIcon.toDataURL() : null,
      }));

      const chosenId = await askRendererToPick(payload);
      const source = sources.find((s) => s.id === chosenId);
      if (!source) return callback();

      // 'loopback' captura o audio do sistema. So o Windows suporta.
      callback(process.platform === 'win32'
        ? { video: source, audio: 'loopback' }
        : { video: source });
    } catch (err) {
      console.error('[captura]', err);
      callback();
    }
  }, { useSystemPicker: false });
}

/* ------------------------------------------------------- host + tunel -- */

async function startHost(port) {
  if (hosted) return hosted.info;
  // index.js explícito: "../server" resolveria para o shim ../server.js.
  const { createServer } = require(path.join(__dirname, '..', 'server', 'index.js'));
  const instance = createServer({
    port: Number(port) || 3000,
    dataDir: path.join(app.getPath('userData'), 'data'),
  });
  const info = await instance.listen();
  hosted = { instance, info };
  return info;
}

async function stopHost() {
  if (!hosted) return;
  await hosted.instance.close().catch(() => {});
  hosted = null;
}

function startTunnel(targetUrl) {
  return new Promise((resolve, reject) => {
    if (tunnelUrl) return resolve(tunnelUrl);
    let child;
    try {
      child = spawn('cloudflared', ['tunnel', '--url', targetUrl], { shell: true });
    } catch (err) {
      return reject(new Error('cloudflared nao encontrado'));
    }
    tunnel = child;

    let settled = false;
    const onData = (buf) => {
      const text = buf.toString();
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m && !settled) {
        settled = true;
        tunnelUrl = m[0];
        resolve(tunnelUrl);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', () => { if (!settled) { settled = true; reject(new Error('cloudflared nao encontrado no PATH')); } });
    child.on('exit', () => { tunnel = null; tunnelUrl = ''; });

    setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('o tunel demorou demais para responder')); }
    }, 40000);
  });
}

function stopTunnel() {
  if (tunnel) { try { tunnel.kill(); } catch {} }
  tunnel = null;
  tunnelUrl = '';
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

ipcMain.handle('app:restart', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('app:home', () => { stopTunnel(); stopHost(); goHome(); });
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  dataDir: path.join(app.getPath('userData'), 'data'),
  hosting: !!hosted,
  hostInfo: hosted ? hosted.info : null,
  tunnelUrl,
}));

ipcMain.handle('host:start', async (_e, { port } = {}) => {
  const info = await startHost(port);
  writeConfig({ mode: 'host', port: info.port });
  return info;
});

ipcMain.handle('tunnel:start', async (_e, { url } = {}) => startTunnel(url));
ipcMain.handle('tunnel:stop', () => { stopTunnel(); return true; });

ipcMain.handle('nav:open', (_e, url) => {
  if (!win || !/^https?:\/\//i.test(String(url))) throw new Error('endereco invalido');
  win.loadURL(url);
  return true;
});

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(url);
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
  stopTunnel();
  stopHost();
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
  stopTunnel();
  stopHost();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { stopTunnel(); });
