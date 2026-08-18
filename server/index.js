'use strict';

/**
 * DiSlackso — servidor de sinalização, perfis e servidores privados.
 *
 * O servidor NÃO vê nem retransmite áudio ou vídeo. Ele só:
 *   1. guarda servidores, canais, membros, convites e perfis;
 *   2. apresenta os participantes de um canal uns aos outros;
 *   3. repassa a sinalização do WebRTC (SDP e ICE);
 *   4. repassa os traços de anotação de quem rabisca na tela alheia.
 * A mídia trafega ponto a ponto entre os clientes.
 *
 * Exporta `createServer()` para o app desktop subir tudo no próprio processo.
 * O protocolo está congelado em docs/CONTRATO.md.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const { createStore } = require('./db/store');
const { makePublicGuild, makePublicUser } = require('./db/shapes');
const { buildIceServers } = require('./ice');
const { registerRoutes } = require('./http/routes');
const { createPresence } = require('./socket/presence');
const { attachSocket } = require('./socket');

/** A interface compilada. É o que o Express serve. */
const WEB_DIR = path.join(__dirname, '..', 'dist', 'web');

function createServer(options = {}) {
  const port = Number(options.port || process.env.PORT || 3000);
  const dataDir = options.dataDir || path.join(__dirname, '..', 'data');
  const uploadDir = path.join(dataDir, 'uploads');
  const certDir = options.certDir || path.join(__dirname, '..', 'certs');

  fs.mkdirSync(uploadDir, { recursive: true });

  const store = createStore({
    dataDir,
    supabase: {
      url: options.supabaseUrl || process.env.SUPABASE_URL,
      key: options.supabaseServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
      row: options.supabaseRow || process.env.SUPABASE_DB_ROW_ID,
    },
  });

  const publicUser = makePublicUser(() => store.data.users);
  const publicGuild = makePublicGuild(publicUser);
  const iceServers = buildIceServers(options);

  /* --------------------------------------------------------------- http -- */

  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: true }));

  if (fs.existsSync(WEB_DIR)) {
    app.use(express.static(WEB_DIR, { extensions: ['html'] }));
  } else {
    // Sem o build, a API funciona e a raiz explica o que fazer — melhor que
    // um 404 seco, que parece o servidor estar fora do ar.
    console.warn('[http] dist/web não existe — rode "npm run build". A API continua no ar.');
    app.get('/', (_req, res) => {
      res.status(503).type('text/plain').send('Interface não compilada. Rode "npm run build".');
    });
  }

  /* ----------------------------------------------------------- listener -- */

  // Com certificado presente subimos em HTTPS: getDisplayMedia e getUserMedia
  // só funcionam em contexto seguro fora de localhost.
  const keyFile = path.join(certDir, 'key.pem');
  const certFile = path.join(certDir, 'cert.pem');
  const secure = fs.existsSync(keyFile) && fs.existsSync(certFile);

  const server = secure
    ? https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app)
    : http.createServer(app);
  const scheme = secure ? 'https' : 'http';

  const io = new Server(server, {
    cors: { origin: true, credentials: true },
    maxHttpBufferSize: 2e6,
  });

  registerRoutes(app, {
    store,
    uploadDir,
    io,
    // Chave compartilhada com o painel de desenvolvedor do app desktop, que
    // manda avisos para todos sem ter conta de usuário.
    adminKey: String(options.adminKey || process.env.ADMIN_KEY || ''),
  });

  const presence = createPresence({ io, store, publicUser, publicGuild });
  attachSocket(io, { store, presence, publicUser, publicGuild, iceServers });

  /* -------------------------------------------------------------- start -- */

  function localAddresses() {
    return Object.values(os.networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => n.address);
  }

  /** Restaura do Supabase antes de aceitar conexões, para ninguém ver o banco vazio. */
  async function listen() {
    await store.restore();
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => {
        resolve({
          port,
          scheme,
          url: `${scheme}://localhost:${port}`,
          lan: localAddresses().map((ip) => `${scheme}://${ip}:${port}`),
        });
      });
    });
  }

  function close() {
    return new Promise((resolve) => {
      io.close(() => server.close(() => resolve()));
    });
  }

  return { app, server, io, listen, close, scheme, port, dataDir };
}

module.exports = { createServer };
