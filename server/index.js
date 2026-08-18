'use strict';

/**
 * DiSlackso - servidor de signaling, perfis e servidores privados.
 *
 * O servidor NAO ve nem retransmite audio/video. Ele so:
 *   1. guarda servidores (guilds), canais, membros, convites e perfis;
 *   2. apresenta os participantes de um canal uns aos outros;
 *   3. repassa mensagens de signaling do WebRTC (SDP e ICE);
 *   4. repassa tracos de anotacao (leves) de quem rabisca na tela alheia.
 * A midia trafega P2P entre os clientes.
 *
 * Exporta createServer() para o app desktop subir tudo no proprio processo.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/* ------------------------------------------------------------- utils --- */

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I/O/0/1
const AVATAR_COLORS = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#00a8fc', '#9b59b6', '#e67e22'];
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const uid = () => crypto.randomUUID();

function inviteCode(len = 8) {
  let out = '';
  for (const b of crypto.randomBytes(len)) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

/* ------------------------------------------------------------- senha --- */

/** scrypt do Node builtin: sem dependência nativa, empacota bem no Electron. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password || ''), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (check.length !== expected.length) return false;
  return crypto.timingSafeEqual(check, expected);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function isValidUsername(v) {
  return USERNAME_RE.test(String(v || ''));
}

function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function cleanText(value, max, fallback = '') {
  const s = String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || fallback;
}

function cleanMultiline(value, max) {
  return String(value == null ? '' : value).replace(/\r/g, '').slice(0, max).trim();
}

function isHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** So aceita caminhos que nos mesmos geramos, nunca URL arbitraria. */
function cleanAssetPath(value) {
  if (value === null || value === '') return '';
  return typeof value === 'string' && /^\/uploads\/[A-Za-z0-9_-]+\.(png|jpg|gif|webp)$/.test(value) ? value : undefined;
}

function normalizeChannel(channel) {
  return {
    id: channel.id || uid(),
    name: cleanText(channel.name, 32, 'novo-canal'),
    type: channel.type === 'text' ? 'text' : 'voice',
    messages: Array.isArray(channel.messages) ? channel.messages.slice(-200) : [],
  };
}

/* ============================================================ createServer */

function createServer(options = {}) {
  const PORT = Number(options.port || process.env.PORT || 3000);
  const DATA_DIR = options.dataDir || path.join(__dirname, '..', 'data');
  const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
  const CERT_DIR = options.certDir || path.join(__dirname, '..', 'certs');
  const DB_FILE = path.join(DATA_DIR, 'db.json');

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  /* ---------------------------------------------------------- storage --- */

  let db = { users: {}, guilds: {}, usernames: {} };
  try {
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('[db] arquivo corrompido, comecando do zero:', err.message);
  }
  db.users = db.users || {};
  db.guilds = db.guilds || {};
  db.usernames = db.usernames || {};
  for (const guild of Object.values(db.guilds)) {
    guild.channels = (guild.channels || []).map(normalizeChannel);
  }

  // Opcional: quando as credenciais do Supabase existem, este mesmo banco
  // JSON é espelhado numa única linha Postgres. Assim o servidor continua
  // simples, mas perfis, servidores e conversas sobrevivem a redeploys.
  const supabaseUrl = String(options.supabaseUrl || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = options.supabaseServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabaseRow = String(options.supabaseRow || process.env.SUPABASE_DB_ROW_ID || 'main');
  const useSupabase = !!(supabaseUrl && supabaseKey && typeof fetch === 'function');
  let lastSupabaseError = null;
  let lastSupabaseOkAt = null;

  if (useSupabase && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) {
    console.warn(`[db] SUPABASE_URL não parece uma URL de projeto Supabase válida: "${supabaseUrl}" `
      + '(esperado algo como https://xxxxxxxx.supabase.co, sem barra no final).');
  }

  /** "fetch failed" do Node não diz o motivo real — err.cause tem o erro de rede de verdade. */
  function describeFetchError(err) {
    const cause = err && err.cause;
    const code = cause && cause.code;
    if (code) return `${err.message} (${code}: ${cause.message || code})`;
    return err.message;
  }

  async function loadRemoteDb() {
    if (!useSupabase) return;
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/app_state?id=eq.${encodeURIComponent(supabaseRow)}&select=data`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      const rows = await res.json();
      lastSupabaseError = null;
      lastSupabaseOkAt = new Date().toISOString();
      if (rows[0] && rows[0].data && typeof rows[0].data === 'object') {
        db = rows[0].data;
        db.users = db.users || {};
        db.guilds = db.guilds || {};
        db.usernames = db.usernames || {};
        for (const guild of Object.values(db.guilds)) guild.channels = (guild.channels || []).map(normalizeChannel);
        console.log('[db] estado restaurado do Supabase');
      } else {
        console.log('[db] Supabase conectado, mas ainda sem linha salva (id=' + supabaseRow + ') — começando do zero.');
      }
    } catch (err) {
      lastSupabaseError = describeFetchError(err);
      console.error('[db] Supabase indisponível; usando cópia local:', lastSupabaseError);
    }
  }

  async function saveRemoteDb() {
    if (!useSupabase) return;
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/app_state?on_conflict=id`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ id: supabaseRow, data: db, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      lastSupabaseError = null;
      lastSupabaseOkAt = new Date().toISOString();
    } catch (err) {
      lastSupabaseError = describeFetchError(err);
      console.error('[db] falha ao espelhar no Supabase:', lastSupabaseError);
    }
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const tmp = DB_FILE + '.tmp';
      fs.writeFile(tmp, JSON.stringify(db, null, 2), (err) => {
        if (err) return console.error('[db] falha ao gravar:', err.message);
        fs.rename(tmp, DB_FILE, (e) => e && console.error('[db] falha ao trocar:', e.message));
      });
      saveRemoteDb();
    }, 250);
  }

  /* ----------------------------------------------------------- perfis --- */

  function defaultUser(id, username, name) {
    return {
      id,
      username,
      passwordHash: '',
      token: '',
      name: cleanText(name || username, 32, 'Anonimo'),
      color: colorFor(id),
      accent: colorFor(id),
      avatar: '',
      banner: '',
      bio: '',
      pronouns: '',
      friends: [],
      createdAt: Date.now(),
    };
  }

  function publicUser(userId) {
    const u = db.users[userId];
    if (!u) return { id: userId, username: '', name: 'Desconhecido', color: colorFor(userId), accent: colorFor(userId), avatar: '', banner: '', bio: '', pronouns: '' };
    return {
      id: u.id,
      username: u.username || '',
      name: u.name,
      color: u.color,
      accent: u.accent || u.color,
      avatar: u.avatar || '',
      banner: u.banner || '',
      bio: u.bio || '',
      pronouns: u.pronouns || '',
      createdAt: u.createdAt,
    };
  }

  function publicGuild(guild) {
    return {
      id: guild.id,
      name: guild.name,
      ownerId: guild.ownerId,
      invite: guild.invite,
      icon: guild.icon || '',
      channels: guild.channels.map(({ messages, ...channel }) => channel),
      members: guild.members.map(publicUser),
    };
  }

  /* -------------------------------------------------------------- ICE --- */

  const iceServers = [
    { urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
      ] },
    // Retransmissor TURN público e gratuito (Open Relay Project), sem precisar de
    // cadastro — cobre quem está atrás de CGNAT/NAT simétrico (comum em internet
    // via rádio/4G/5G) enquanto nenhum TURN próprio for configurado. As portas 443
    // (inclusive por TCP) ajudam em redes que bloqueiam UDP. É best-effort: pra um
    // grupo que depende disso o tempo todo, configure seu próprio TURN
    // (TURN_URL/TURN_USER/TURN_PASS) — ver DEPLOY.md.
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ];
  const turnUrl = options.turnUrl || process.env.TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: String(turnUrl).split(',').map((s) => s.trim()).filter(Boolean),
      username: options.turnUser || process.env.TURN_USER || '',
      credential: options.turnPass || process.env.TURN_PASS || '',
    });
  }

  /* ------------------------------------------------------------- http --- */

  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  app.get('/api/health', (_req, res) => {
    // "supabase: false" com o servico no Render explica sozinho contas que
    // somem: sem espelhamento remoto, os dados vivem so no disco efemero e
    // qualquer redeploy comeca do zero. "supabaseError" mostra por que a
    // ultima tentativa de ler/gravar no Supabase falhou, se falhou.
    res.json({
      ok: true,
      guilds: Object.keys(db.guilds).length,
      users: Object.keys(db.users).length,
      supabase: useSupabase,
      supabaseError: lastSupabaseError,
      supabaseLastOkAt: lastSupabaseOkAt,
    });
  });

  /**
   * Upload de avatar/banner. O cliente manda um data URL; gravamos como
   * arquivo e devolvemos o caminho. Aceita GIF animado (por isso nao
   * reprocessamos a imagem no servidor).
   */
  app.post('/api/upload', (req, res) => {
    try {
      const { userId, dataUrl, kind } = req.body || {};
      if (!userId || !db.users[userId]) return res.status(403).json({ error: 'usuario desconhecido' });
      if (!['avatar', 'banner', 'guild'].includes(kind)) return res.status(400).json({ error: 'tipo invalido' });

      const m = /^data:([^;,]+);base64,(.+)$/.exec(String(dataUrl || ''));
      if (!m) return res.status(400).json({ error: 'imagem invalida' });

      const ext = IMAGE_TYPES[m[1]];
      if (!ext) return res.status(415).json({ error: 'use PNG, JPG, GIF ou WEBP' });

      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: `imagem acima de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` });
      }

      const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
      res.json({ url: `/uploads/${name}` });
    } catch (err) {
      console.error('[upload]', err);
      res.status(500).json({ error: 'falha ao salvar' });
    }
  });

  /* ---------------------------------------------------------- listener -- */

  let server;
  let scheme = 'http';
  const keyFile = path.join(CERT_DIR, 'key.pem');
  const certFile = path.join(CERT_DIR, 'cert.pem');
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    server = https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app);
    scheme = 'https';
  } else {
    server = http.createServer(app);
  }

  const io = new Server(server, { cors: { origin: true, credentials: true }, maxHttpBufferSize: 2e6 });

  /* -------------------------------------------------------- signaling --- */

  const sessions = new Map(); // socketId -> { userId, room, state }

  const guildRoom = (id) => `guild:${id}`;
  const voiceRoom = (g, c) => `voice:${g}/${c}`;
  const emptyState = () => ({ mic: false, screen: false, speaking: false, annot: true, streams: {} });

  function peerInfo(socketId) {
    const s = sessions.get(socketId);
    if (!s) return null;
    return { sid: socketId, user: publicUser(s.userId), state: s.state };
  }

  function guildPresence(guildId) {
    const guild = db.guilds[guildId];
    if (!guild) return {};
    const presence = {};
    for (const ch of guild.channels) {
      const room = io.sockets.adapter.rooms.get(voiceRoom(guildId, ch.id));
      presence[ch.id] = [...(room || [])].map(peerInfo).filter(Boolean);
    }
    return presence;
  }

  const pushPresence = (guildId) =>
    io.to(guildRoom(guildId)).emit('presence:update', { guildId, presence: guildPresence(guildId) });

  /** Quem do servidor está com o app aberto agora (não só em sala de voz). */
  function guildOnlineIds(guildId) {
    const room = io.sockets.adapter.rooms.get(guildRoom(guildId));
    const ids = new Set();
    for (const sid of room || []) {
      const s = sessions.get(sid);
      if (s) ids.add(s.userId);
    }
    return [...ids];
  }

  const pushOnline = (guildId) =>
    io.to(guildRoom(guildId)).emit('guild:online', { guildId, online: guildOnlineIds(guildId) });

  function pushGuild(guildId) {
    const guild = db.guilds[guildId];
    if (guild) io.to(guildRoom(guildId)).emit('guild:update', publicGuild(guild));
  }

  function leaveVoice(socket) {
    const s = sessions.get(socket.id);
    if (!s || !s.room) return;
    const room = s.room;
    const guildId = room.slice('voice:'.length).split('/')[0];
    socket.leave(room);
    s.room = null;
    s.state = emptyState();
    socket.to(room).emit('voice:peerLeft', { sid: socket.id });
    pushPresence(guildId);
  }

  function guard(cb, fn) {
    try {
      fn();
    } catch (err) {
      if (typeof cb === 'function') cb({ error: err.message || 'erro interno' });
      else console.error('[socket]', err);
    }
  }

  /** Servidores dos quais o usuario participa. */
  const guildsOf = (userId) => Object.values(db.guilds).filter((g) => g.members.includes(userId));

  /** Abre a sessão desse socket pra esse usuário e devolve o payload que login/registro/hello respondem. */
  function establishSession(socket, user) {
    sessions.set(socket.id, { userId: user.id, room: null, state: emptyState() });
    const guilds = guildsOf(user.id);
    for (const g of guilds) socket.join(guildRoom(g.id));
    const payload = {
      user: publicUser(user.id), guilds: guilds.map(publicGuild), iceServers, sid: socket.id,
      token: user.token, friends: user.friends || [],
    };
    for (const g of guilds) { pushPresence(g.id); pushOnline(g.id); }
    return payload;
  }

  io.on('connection', (socket) => {
    /* --------------------------------------------------------- conta --- */

    // Retomada silenciosa de sessão (o cliente já tem userId+token salvos).
    socket.on('hello', ({ userId, token } = {}, cb) => guard(cb, () => {
      const user = userId && db.users[userId];
      if (!user || !user.token || !token || user.token !== token) {
        throw new Error('auth_required');
      }
      save();
      cb(establishSession(socket, user));
    }));

    socket.on('auth:register', ({ username, password, name } = {}, cb) => guard(cb, () => {
      if (!isValidUsername(username)) throw new Error('Nickname precisa ter de 3 a 20 letras, números ou _.');
      if (!password || String(password).length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      const key = String(username).toLowerCase();
      if (db.usernames[key]) throw new Error('Esse nickname já está em uso.');

      const id = uid();
      const user = defaultUser(id, username, name);
      user.passwordHash = hashPassword(password);
      user.token = newToken();
      db.users[id] = user;
      db.usernames[key] = id;
      save();
      cb(establishSession(socket, user));
    }));

    socket.on('auth:login', ({ username, password } = {}, cb) => guard(cb, () => {
      const key = String(username || '').toLowerCase();
      const id = db.usernames[key];
      const user = id && db.users[id];
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        throw new Error('Nickname ou senha incorretos.');
      }
      user.token = newToken();
      save();
      cb(establishSession(socket, user));
    }));

    // Migra uma conta anônima antiga (de antes do login existir) pro novo sistema,
    // preservando servidores e avatar — só funciona enquanto ela não tiver senha.
    socket.on('auth:claim', ({ userId, username, password } = {}, cb) => guard(cb, () => {
      const user = userId && db.users[userId];
      if (!user) throw new Error('Conta não encontrada.');
      if (user.passwordHash) throw new Error('Essa conta já tem senha; use Entrar.');
      if (!isValidUsername(username)) throw new Error('Nickname precisa ter de 3 a 20 letras, números ou _.');
      if (!password || String(password).length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      const key = String(username).toLowerCase();
      if (db.usernames[key]) throw new Error('Esse nickname já está em uso.');

      user.username = username;
      user.passwordHash = hashPassword(password);
      user.token = newToken();
      db.usernames[key] = user.id;
      save();
      cb(establishSession(socket, user));
    }));

    /* ------------------------------------------------------- perfil --- */

    socket.on('user:update', (patch = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      if (!s) throw new Error('nao autenticado');
      const user = db.users[s.userId];
      if (!user) throw new Error('usuario inexistente');

      if (patch.name !== undefined) user.name = cleanText(patch.name, 32, user.name);
      if (patch.bio !== undefined) user.bio = cleanMultiline(patch.bio, 300);
      if (patch.pronouns !== undefined) user.pronouns = cleanText(patch.pronouns, 20);
      if (patch.accent !== undefined && isHexColor(patch.accent)) user.accent = patch.accent;

      for (const key of ['avatar', 'banner']) {
        if (patch[key] === undefined) continue;
        const clean = cleanAssetPath(patch[key]);
        if (clean === undefined) throw new Error('imagem invalida');
        user[key] = clean;
      }
      save();

      const me = publicUser(user.id);
      cb({ user: me });
      for (const g of guildsOf(user.id)) {
        io.to(guildRoom(g.id)).emit('user:update', me);
        pushPresence(g.id);
      }
    }));

    /* -------------------------------------------------------- amigos --- */

    socket.on('friend:add', ({ friendId } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      if (!s) throw new Error('nao autenticado');
      const user = db.users[s.userId];
      if (!user) throw new Error('usuario inexistente');
      if (!friendId || !db.users[friendId]) throw new Error('usuario nao encontrado');
      if (friendId === user.id) throw new Error('nao dá pra se adicionar');
      user.friends = user.friends || [];
      if (!user.friends.includes(friendId)) user.friends.push(friendId);
      save();
      cb({ friends: user.friends });
    }));

    socket.on('friend:remove', ({ friendId } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      if (!s) throw new Error('nao autenticado');
      const user = db.users[s.userId];
      if (!user) throw new Error('usuario inexistente');
      user.friends = (user.friends || []).filter((id) => id !== friendId);
      save();
      cb({ friends: user.friends });
    }));

    /* ------------------------------------------------------- guilds --- */

    socket.on('guild:create', ({ name } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      if (!s) throw new Error('nao autenticado');
      const guild = {
        id: uid(),
        name: cleanText(name, 48, 'Meu Servidor'),
        ownerId: s.userId,
        invite: inviteCode(),
        icon: '',
        createdAt: Date.now(),
        members: [s.userId],
        channels: [
          { id: uid(), name: 'geral', type: 'text', messages: [] },
          { id: uid(), name: 'Sala Principal', type: 'voice', messages: [] },
        ],
      };
      db.guilds[guild.id] = guild;
      save();
      socket.join(guildRoom(guild.id));
      cb({ guild: publicGuild(guild) });
      pushOnline(guild.id);
    }));

    socket.on('guild:join', ({ invite } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      if (!s) throw new Error('nao autenticado');
      const code = String(invite || '').trim().toUpperCase();
      const guild = Object.values(db.guilds).find((g) => g.invite === code);
      if (!guild) throw new Error('Convite invalido ou expirado.');
      if (!guild.members.includes(s.userId)) {
        guild.members.push(s.userId);
        save();
      }
      socket.join(guildRoom(guild.id));
      cb({ guild: publicGuild(guild) });
      pushGuild(guild.id);
      pushPresence(guild.id);
      pushOnline(guild.id);
    }));

    socket.on('guild:update', ({ guildId, name, icon } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      const guild = db.guilds[guildId];
      if (!s || !guild) throw new Error('servidor inexistente');
      if (guild.ownerId !== s.userId) throw new Error('Somente o dono pode editar.');
      if (name !== undefined) guild.name = cleanText(name, 48, guild.name);
      if (icon !== undefined) {
        const clean = cleanAssetPath(icon);
        if (clean === undefined) throw new Error('imagem invalida');
        guild.icon = clean;
      }
      save();
      cb({ guild: publicGuild(guild) });
      pushGuild(guildId);
    }));

    socket.on('guild:leave', ({ guildId } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      const guild = db.guilds[guildId];
      if (!s || !guild) throw new Error('servidor inexistente');
      if (guild.ownerId === s.userId) throw new Error('O dono nao pode sair; exclua o servidor.');
      guild.members = guild.members.filter((id) => id !== s.userId);
      save();
      leaveVoice(socket);
      socket.leave(guildRoom(guildId));
      cb({ ok: true });
      pushGuild(guildId);
      pushPresence(guildId);
      pushOnline(guildId);
    }));

    socket.on('guild:delete', ({ guildId } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      const guild = db.guilds[guildId];
      if (!s || !guild) throw new Error('servidor inexistente');
      if (guild.ownerId !== s.userId) throw new Error('Somente o dono pode excluir.');
      io.to(guildRoom(guildId)).emit('guild:deleted', { guildId });
      delete db.guilds[guildId];
      save();
      cb({ ok: true });
    }));

    socket.on('guild:regenInvite', ({ guildId } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      const guild = db.guilds[guildId];
      if (!s || !guild) throw new Error('servidor inexistente');
      if (guild.ownerId !== s.userId) throw new Error('Somente o dono pode gerar convites.');
      guild.invite = inviteCode();
      save();
      cb({ invite: guild.invite });
      pushGuild(guildId);
    }));

    socket.on('channel:create', ({ guildId, name, type = 'voice' } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      const guild = db.guilds[guildId];
      if (!s || !guild) throw new Error('servidor inexistente');
      if (!guild.members.includes(s.userId)) throw new Error('sem acesso');
      if (guild.channels.length >= 40) throw new Error('Limite de 40 canais.');
      if (!['voice', 'text'].includes(type)) throw new Error('tipo de canal inválido');
      guild.channels.push({ id: uid(), name: cleanText(name, 32, type === 'text' ? 'novo-texto' : 'Nova Sala'), type, messages: [] });
      save();
      cb({ guild: publicGuild(guild) });
      pushGuild(guildId);
      pushPresence(guildId);
    }));

    socket.on('channel:delete', ({ guildId, channelId } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      const guild = db.guilds[guildId];
      if (!s || !guild) throw new Error('servidor inexistente');
      if (guild.ownerId !== s.userId) throw new Error('Somente o dono pode excluir salas.');
      if (!guild.channels.some((c) => c.id === channelId)) throw new Error('canal inexistente');
      guild.channels = guild.channels.filter((c) => c.id !== channelId);
      save();
      cb({ guild: publicGuild(guild) });
      pushGuild(guildId);
      pushPresence(guildId);
    }));

    /* -------------------------------------------------------- voice --- */

    socket.on('voice:join', ({ guildId, channelId } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      const guild = db.guilds[guildId];
      if (!s) throw new Error('nao autenticado');
      if (!guild || !guild.members.includes(s.userId)) throw new Error('sem acesso a este servidor');
      if (!guild.channels.some((c) => c.id === channelId && c.type !== 'text')) throw new Error('sala de voz inexistente');

      leaveVoice(socket);
      const room = voiceRoom(guildId, channelId);
      socket.join(room);
      s.room = room;
      s.state = emptyState();

      const others = [...(io.sockets.adapter.rooms.get(room) || [])]
        .filter((id) => id !== socket.id)
        .map(peerInfo)
        .filter(Boolean);

      socket.to(room).emit('voice:peerJoined', peerInfo(socket.id));
      cb({ peers: others });
      pushPresence(guildId);
    }));

    socket.on('voice:leave', (_p, cb) => guard(cb, () => {
      leaveVoice(socket);
      if (typeof cb === 'function') cb({ ok: true });
    }));

    socket.on('voice:state', (state = {}) => {
      const s = sessions.get(socket.id);
      if (!s || !s.room) return;
      s.state = {
        mic: !!state.mic,
        screen: !!state.screen,
        speaking: !!state.speaking,
        annot: state.annot !== false,
        streams: {
          mic: state.streams && state.streams.mic ? String(state.streams.mic).slice(0, 128) : null,
          screen: state.streams && state.streams.screen ? String(state.streams.screen).slice(0, 128) : null,
        },
      };
      socket.to(s.room).emit('voice:state', { sid: socket.id, state: s.state });
      pushPresence(s.room.slice('voice:'.length).split('/')[0]);
    });

    socket.on('rtc:signal', ({ to, data } = {}) => {
      const s = sessions.get(socket.id);
      const target = sessions.get(to);
      if (!s || !s.room || !target || target.room !== s.room) return;
      io.to(to).emit('rtc:signal', { from: socket.id, data });
    });

    /* --------------------------------------------------------- texto --- */

    socket.on('message:history', ({ guildId, channelId } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      const guild = db.guilds[guildId];
      if (!s || !guild || !guild.members.includes(s.userId)) throw new Error('sem acesso');
      const channel = guild.channels.find((c) => c.id === channelId && c.type === 'text');
      if (!channel) throw new Error('canal de texto inexistente');
      cb({ messages: (channel.messages || []).slice(-100) });
    }));

    socket.on('message:send', ({ guildId, channelId, text } = {}, cb) => guard(cb, () => {
      const s = sessions.get(socket.id);
      const guild = db.guilds[guildId];
      if (!s || !guild || !guild.members.includes(s.userId)) throw new Error('sem acesso');
      const channel = guild.channels.find((c) => c.id === channelId && c.type === 'text');
      if (!channel) throw new Error('canal de texto inexistente');
      const body = cleanMultiline(text, 2000);
      if (!body) throw new Error('a mensagem está vazia');
      const message = { id: uid(), userId: s.userId, text: body, createdAt: Date.now() };
      channel.messages = (channel.messages || []).concat(message).slice(-200);
      save();
      io.to(guildRoom(guildId)).emit('message:new', { guildId, channelId, message: { ...message, user: publicUser(s.userId) } });
      cb({ message: { ...message, user: publicUser(s.userId) } });
    }));

    /* --------------------------------------------------- anotacoes --- */

    // Tracos sao leves (pontos normalizados), entao vao pelo socket mesmo.
    // Sempre limitados a sala de voz atual.
    socket.on('annot:draw', (payload = {}) => {
      const s = sessions.get(socket.id);
      if (!s || !s.room || !payload.target) return;
      socket.to(s.room).emit('annot:draw', { from: socket.id, ...payload });
    });

    socket.on('annot:clear', (payload = {}) => {
      const s = sessions.get(socket.id);
      if (!s || !s.room) return;
      socket.to(s.room).emit('annot:clear', { from: socket.id, ...payload });
    });

    socket.on('disconnect', () => {
      const s = sessions.get(socket.id);
      const affected = s ? guildsOf(s.userId) : [];
      leaveVoice(socket);
      sessions.delete(socket.id);
      // Recalcula depois de apagar a sessão: se havia outra aba/dispositivo
      // conectado com o mesmo usuário, ele continua aparecendo online.
      for (const g of affected) pushOnline(g.id);
    });
  });

  /* ------------------------------------------------------------ start --- */

  function localAddresses() {
    return Object.values(os.networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => n.address);
  }

  function listen() {
    return loadRemoteDb().then(() => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, () => {
        resolve({
          port: PORT,
          scheme,
          url: `${scheme}://localhost:${PORT}`,
          lan: localAddresses().map((ip) => `${scheme}://${ip}:${PORT}`),
        });
      });
    }));
  }

  function close() {
    return new Promise((resolve) => {
      io.close(() => server.close(() => resolve()));
    });
  }

  return { app, server, io, listen, close, scheme, port: PORT, dataDir: DATA_DIR };
}

module.exports = { createServer };
