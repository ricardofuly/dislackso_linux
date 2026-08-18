/* ==========================================================================
   app.js — interface, salas e ligação com o servidor
   ========================================================================== */

'use strict';

const S = {
  socket: null,
  me: null,
  guilds: [],
  activeGuildId: null,
  activeTextChannelId: null,
  messages: new Map(), // guildId/channelId -> mensagens já carregadas
  presence: {},        // guildId -> { channelId: [peerInfo] }
  online: {},           // guildId -> Set(userId) conectados agora
  voice: null,         // { guildId, channelId }
  rejoin: null,        // sala a retomar depois de uma reconexão
  focusId: null,       // tile em destaque ('local' ou sid), null = grade
  sharingSeen: new Set(),
  gateMode: 'login',   // 'login' | 'register'
  gateBusy: false,
  localMutes: new Set(),    // sid -> mutado só pra mim
  localVolumes: new Map(),  // sid -> 0..1, só pra mim
  friends: new Set(),       // userId de quem eu marquei como amigo
  watching: new Set(),      // sid de quem eu pedi pra assistir a tela
  previews: new Map(),      // sid -> data URL da última prévia recebida
};

const tiles = new Map();     // id -> { el, video, streamId, annotActive }
const audioEls = new Map();  // sid -> HTMLAudioElement

/* =============================================================== API ==== */

const App = {
  me: () => S.me,
  refresh: () => renderStage(),

  async updateProfile(patch) {
    if (!S.me) return;
    try {
      const res = await ask('user:update', patch);
      S.me = res.user;
      LS.set('name', res.user.name);
      renderAll();
    } catch (err) {
      toast('Não consegui salvar: ' + err.message);
    }
  },

  /** Manda todo áudio para a saída escolhida nas configurações. */
  applySink() {
    const id = Settings.get('speakerId');
    if (!('setSinkId' in HTMLMediaElement.prototype)) return;
    const els = [...audioEls.values(), ...$$('#stage-wrap video')];
    for (const el of els) {
      el.setSinkId(id || '').catch((err) => console.warn('[audio] saída:', err.message));
    }
  },
};

/* ------------------------------------------------------ chamadas socket - */

function ask(event, payload) {
  return new Promise((resolve, reject) => {
    if (!S.socket) return reject(new Error('sem conexão'));
    S.socket.emit(event, payload, (res) => {
      if (!res) return reject(new Error('sem resposta do servidor'));
      if (res.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
}

/* ============================================================= login ==== */

/** Conta anônima de antes do login existir: tem userId salvo, mas sem token. */
const legacyUserId = () => (LS.get('authToken') ? null : LS.get('userId'));

function showGate() {
  $('#gate').classList.remove('hidden');
  const saved = LS.get('name', '');
  if (saved) $('#gate-username').value = saved.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  setGateMode(legacyUserId() ? 'register' : 'login');
  setTimeout(() => $('#gate-username').focus(), 40);
}

function hideGate() {
  $('#gate').classList.add('hidden');
}

function setGateMode(mode) {
  S.gateMode = mode;
  $('#gate-tab-login').classList.toggle('active', mode === 'login');
  $('#gate-tab-register').classList.toggle('active', mode === 'register');
  $('#gate-go').textContent = mode === 'login' ? 'Entrar' : (legacyUserId() ? 'Proteger minha conta' : 'Criar conta');
  $('#gate-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#gate-hint').textContent = mode === 'register' && legacyUserId()
    ? 'Você já usava o app sem senha — escolha um nickname e uma senha pra proteger essa mesma conta (seus servidores continuam salvos).'
    : 'Sem e-mail — só nickname e senha, guardados no nosso banco.';
  $('#gate-error').classList.add('hidden');
}

async function submitGate() {
  if (S.gateBusy) return;
  const username = $('#gate-username').value.trim();
  const password = $('#gate-password').value;
  if (!username || !password) return showGateError('Preencha nickname e senha.');

  S.gateBusy = true;
  $('#gate-go').disabled = true;
  try {
    let res;
    if (S.gateMode === 'login') {
      res = await ask('auth:login', { username, password });
    } else if (legacyUserId()) {
      try {
        res = await ask('auth:claim', { userId: legacyUserId(), username, password });
      } catch (err) {
        // O userId salvo neste navegador não existe (mais) no servidor —
        // não tem o que "proteger", então cria uma conta nova em vez de
        // travar o usuário numa mensagem de erro sem saída.
        if (err.message !== 'Conta não encontrada.') throw err;
        LS.del('userId');
        res = await ask('auth:register', { username, password, name: username });
      }
    } else {
      res = await ask('auth:register', { username, password, name: username });
    }
    establishSession(res);
  } catch (err) {
    showGateError(err.message);
  } finally {
    S.gateBusy = false;
    $('#gate-go').disabled = false;
  }
}

function showGateError(msg) {
  $('#gate-error').textContent = msg;
  $('#gate-error').classList.remove('hidden');
}

/** Chamado depois de hello/auth:login/auth:register/auth:claim: abre a sessão pra valer. */
function establishSession(res) {
  S.me = res.user;
  LS.set('userId', res.user.id);
  LS.set('authToken', res.token);
  LS.set('name', res.user.name);
  S.guilds = res.guilds;
  S.friends = new Set(res.friends || []);
  LS.set('friendsCache', [...S.friends]);
  hideGate();

  Voice.configure({ socket: S.socket, sid: res.sid, iceServers: res.iceServers });
  Voice.setQuality(Settings.get('quality'));
  Voice.setContentHint(Settings.get('contentHint'));

  if (!S.activeGuildId && S.guilds.length) S.activeGuildId = S.guilds[0].id;
  renderAll();
  handleInviteHash();

  if (S.rejoin) {
    const { guildId, channelId } = S.rejoin;
    S.rejoin = null;
    joinVoice(guildId, channelId).then(() => toast('Reconectado à sala.'));
  }
}

/** Sai só desta conta — mantém tema/preferências, some com userId/token salvos. */
function logout() {
  LS.del('userId');
  LS.del('authToken');
  LS.del('guildsCache');
  LS.del('profileCache');
  location.reload();
}

function wireGate() {
  $('#gate-tab-login').onclick = () => setGateMode('login');
  $('#gate-tab-register').onclick = () => setGateMode('register');
  $('#gate-form').onsubmit = (e) => { e.preventDefault(); submitGate(); };
}

/* =========================================================== conexão ==== */

function connect() {
  const serverUrl = window.ENV && window.ENV.SERVER_URL ? window.ENV.SERVER_URL : '';
  const socket = io(serverUrl, { transports: ['websocket', 'polling'] });
  S.socket = socket;
  Annot.init(socket);

  socket.on('connect', async () => {
    const userId = LS.get('userId');
    const token = LS.get('authToken');
    if (!userId || !token) return showGate();
    try {
      const res = await ask('hello', { userId, token });
      establishSession(res);
    } catch (err) {
      if (err.message === 'auth_required') {
        LS.del('authToken');
        showGate();
      } else {
        toast('Falha ao entrar: ' + err.message);
      }
    }
  });

  socket.on('disconnect', () => {
    $('#stage-conn').textContent = 'Reconectando…';
    S.me = null;
    if (S.voice) { S.rejoin = S.voice; leaveVoice({ silent: true }); }
  });

  socket.on('guild:online', ({ guildId, online }) => {
    S.online[guildId] = new Set(online);
    renderMembers();
  });

  socket.on('guild:update', (guild) => {
    const i = S.guilds.findIndex((g) => g.id === guild.id);
    if (i === -1) S.guilds.push(guild); else S.guilds[i] = guild;
    renderAll();
  });

  socket.on('guild:deleted', ({ guildId }) => {
    S.guilds = S.guilds.filter((g) => g.id !== guildId);
    if (S.voice && S.voice.guildId === guildId) leaveVoice({ silent: true });
    if (S.activeGuildId === guildId) S.activeGuildId = S.guilds.length ? S.guilds[0].id : null;
    toast('Um servidor foi excluído pelo dono.');
    renderAll();
  });

  socket.on('user:update', (user) => {
    // Atualiza esse usuário em todos os servidores que já temos em memória.
    for (const g of S.guilds) {
      const i = g.members.findIndex((m) => m.id === user.id);
      if (i !== -1) g.members[i] = user;
    }
    for (const peer of Voice.peers.values()) {
      if (peer.user.id === user.id) peer.user = user;
    }
    if (S.me && user.id === S.me.id) S.me = user;
    renderAll();
  });

  socket.on('presence:update', ({ guildId, presence }) => {
    S.presence[guildId] = presence;
    renderChannels();
    renderRail();
  });

  socket.on('voice:peerJoined', (info) => {
    if (!S.voice || !info) return;
    Voice.addPeer(info);
    toast(`${info.user.name} entrou na sala.`);
    feedback('join');
  });

  socket.on('voice:peerLeft', ({ sid }) => {
    const peer = Voice.peers.get(sid);
    Voice.removePeer(sid);
    dropAudio(sid);
    Annot.detach(sid);
    if (S.focusId === sid) S.focusId = null;
    if (peer) toast(`${peer.user.name} saiu da sala.`);
    feedback('leave');
  });

  socket.on('voice:state', ({ sid, state }) => {
    Voice.setPeerState(sid, state);
    maybeAutoFocus(sid, state);
    // Se a pessoa parou de compartilhar, esquece que eu tava assistindo —
    // senão, quando ela compartilhar de novo, o app acha que já devia
    // estar recebendo o vídeo (e nunca manda o pedido de novo).
    if (!state.screen) { S.watching.delete(sid); S.previews.delete(sid); }
  });

  socket.on('screen:preview', ({ from, dataUrl }) => {
    if (dataUrl) S.previews.set(from, dataUrl);
    else S.previews.delete(from);
    if (!S.watching.has(from)) renderStageContent();
  });

  socket.on('message:new', ({ guildId, channelId, message }) => {
    const key = messageKey(guildId, channelId);
    const list = S.messages.get(key) || [];
    if (!list.some((m) => m.id === message.id)) S.messages.set(key, [...list, message].slice(-200));
    if (S.activeGuildId === guildId && S.activeTextChannelId === channelId) renderTextChannel();
    else feedback('message');
  });

  socket.on('rtc:signal', ({ from, data }) => Voice.handleSignal(from, data));

  socket.on('admin:message', (payload) => showAnnouncement(payload));
}

/* ========================================================= avisos admin = */

const announceQueue = [];
let announceShowing = false;

/** Aviso do painel de dev, ou (no futuro) de atualização — sempre um por vez. */
function showAnnouncement(payload) {
  if (!payload || announceQueue.some((p) => p.id === payload.id)) return;
  announceQueue.push(payload);
  if (!announceShowing) drainAnnounceQueue();
}

function drainAnnounceQueue() {
  const next = announceQueue.shift();
  if (!next) { announceShowing = false; return; }
  announceShowing = true;

  $('#announce-text').textContent = next.message;
  $('#announce').classList.remove('hidden');
  feedback('announce');

  if (next.forceFocus && isDesktop() && window.desktop.focusWindow) {
    window.desktop.focusWindow();
  }

  const close = () => {
    $('#announce').classList.add('hidden');
    $('#announce-ok').onclick = null;
    drainAnnounceQueue();
  };
  $('#announce-ok').onclick = close;
}

/** Coloca em destaque quem acabou de começar a transmitir. */
function maybeAutoFocus(sid, state) {
  const wasSharing = S.sharingSeen.has(sid);
  if (state.screen && !wasSharing) {
    S.sharingSeen.add(sid);
    if (Settings.get('autoFocus') && !S.focusId) S.focusId = sid;
    const peer = Voice.peers.get(sid);
    if (peer) toast(`${peer.user.name} começou a transmitir.`);
    feedback('screenstart');
  } else if (!state.screen && wasSharing) {
    S.sharingSeen.delete(sid);
    if (S.focusId === sid) S.focusId = null;
    const peer = Voice.peers.get(sid);
    if (peer) toast(`${peer.user.name} parou de transmitir.`);
    feedback('screenstop');
  }
}

/* ------------------------------------------------------ convite por URL - */

function handleInviteHash() {
  const m = location.hash.match(/invite=([A-Z0-9]+)/i);
  if (!m) return;
  const code = m[1].toUpperCase();
  history.replaceState(null, '', location.pathname);
  if (S.guilds.some((g) => g.invite === code)) return;
  openModal({
    title: 'Convite recebido',
    body: `<p>Você foi convidado para um servidor privado.</p>
           <p style="font-family:ui-monospace,monospace;color:var(--bright)">Código: ${esc(code)}</p>`,
    okText: 'Entrar no servidor',
    onOk: () => joinByCode(code),
  });
}

/* ============================================================ render ==== */

const activeGuild = () => S.guilds.find((g) => g.id === S.activeGuildId) || null;

function renderAll() {
  renderRail();
  renderChannels();
  renderMe();
  renderStage();
  renderTextChannel();
  renderMembers();
  persistCache();
}

/** Guarda perfil e lista de servidores localmente, pra aparecer na hora no próximo boot. */
function persistCache() {
  LS.set('guildsCache', S.guilds);
  if (S.me) LS.set('profileCache', S.me);
}

function renderMembers() {
  const box = $('#members-body');
  if (!box) return;
  const guild = activeGuild();
  if (!guild) { box.innerHTML = ''; return; }

  const online = S.online[guild.id] || new Set();
  const sorted = [...guild.members].sort((a, b) => {
    const fa = S.friends.has(a.id), fb = S.friends.has(b.id);
    if (fa !== fb) return fa ? -1 : 1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
  const onlineMembers = sorted.filter((m) => online.has(m.id));
  const offlineMembers = sorted.filter((m) => !online.has(m.id));

  const section = (label, members) => {
    if (!members.length) return '';
    const rows = members.map((m) => `
      <button class="member-row ${online.has(m.id) ? 'online' : 'offline'}" data-id="${esc(m.id)}">
        ${avatarHTML(m, 'sm')}
        <span class="nm">${esc(m.name)}${S.me && m.id === S.me.id ? ' (você)' : ''}</span>
        ${S.friends.has(m.id) ? `<span class="friend-badge" title="Amigo">${icon('star', 12)}</span>` : ''}
      </button>`).join('');
    return `<div class="section-label">${esc(label)} — ${members.length}</div>${rows}`;
  };

  box.innerHTML = section('Online', onlineMembers) + section('Offline', offlineMembers);
  for (const btn of $$('.member-row', box)) {
    const member = guild.members.find((m) => m.id === btn.dataset.id);
    if (!member) continue;
    btn.onclick = () => showProfile(member);
    btn.oncontextmenu = (e) => showUserMenu(e, member);
  }
}

/* -------------------------------------------------- menu de contexto --- */

function closeUserMenu() {
  for (const m of $$('.user-menu')) m.remove();
}

function bumpVolume(sid, delta) {
  const cur = S.localVolumes.get(sid);
  const next = clamp((cur == null ? 1 : cur) + delta, 0, 2);
  S.localVolumes.set(sid, next);
  refreshAllPeerVolumes();
  toast(`Volume de quem tá falando: ${Math.round(next * 100)}%`);
}

function toggleFriend(userId, add) {
  ask(add ? 'friend:add' : 'friend:remove', { friendId: userId })
    .then(({ friends }) => {
      S.friends = new Set(friends);
      LS.set('friendsCache', friends);
      renderMembers();
      renderChannels();
    })
    .catch((err) => toast(err.message));
}

/** Botão direito num usuário: mutar/volume (só quem está na mesma sala de voz) e amigos. */
function showUserMenu(e, user) {
  e.preventDefault();
  e.stopPropagation();
  closeUserMenu();
  if (!S.me || user.id === S.me.id) return;

  const peer = [...Voice.peers.values()].find((p) => p.user.id === user.id);
  const sid = peer ? peer.sid : null;
  const muted = sid && S.localMutes.has(sid);
  const isFriend = S.friends.has(user.id);

  const menu = el('div', 'popover user-menu');
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  const item = (icoName, label, onClick) => {
    const b = el('button', '', `<span data-icon="${icoName}" data-size="16"></span> ${esc(label)}`);
    b.onclick = () => { onClick(); closeUserMenu(); };
    menu.appendChild(b);
  };

  if (sid) {
    item(muted ? 'volume' : 'volumeOff', muted ? 'Desmutar' : 'Mutar só pra mim', () => {
      if (muted) S.localMutes.delete(sid); else S.localMutes.add(sid);
      refreshAllPeerVolumes();
    });
    item('volumeLow', 'Diminuir volume', () => bumpVolume(sid, -0.2));
    item('volume', 'Aumentar volume', () => bumpVolume(sid, 0.2));
    menu.appendChild(Object.assign(document.createElement('hr')));
  }

  item(isFriend ? 'starOff' : 'userPlus', isFriend ? 'Remover dos amigos' : 'Adicionar como amigo',
    () => toggleFriend(user.id, !isFriend));
  item('user', 'Ver perfil', () => showProfile(user));

  document.body.appendChild(menu);
  hydrateIcons(menu);

  const r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
  if (r.bottom > window.innerHeight) menu.style.top = `${Math.max(8, window.innerHeight - r.height - 8)}px`;
}

/**
 * Atualiza os nós existentes em vez de recriar tudo (innerHTML = '') a cada
 * chamada. renderRail() roda a cada presence:update — que o servidor manda
 * toda vez que ALGUÉM muda de estado de voz, inclusive só de "falando" —
 * então acontece várias vezes por minuto numa conversa normal. Recriar o
 * <img> do ícone toda hora fazia ele piscar (o navegador recarrega a
 * imagem do zero a cada innerHTML novo).
 */
function renderRail() {
  const list = $('#rail-list');
  const seen = new Set();

  for (const g of S.guilds) {
    seen.add(g.id);
    let btn = list.querySelector(`[data-guild-id="${g.id}"]`);
    if (!btn) {
      btn = el('button', 'rail-btn');
      btn.dataset.guildId = g.id;
      btn.onclick = () => { S.activeGuildId = g.id; S.activeTextChannelId = null; renderAll(); };
      list.appendChild(btn);
    }
    btn.classList.toggle('active', g.id === S.activeGuildId);
    btn.title = g.name;

    const wantIcon = g.icon ? assetUrl(g.icon) : '';
    if (btn.dataset.icon !== wantIcon) {
      btn.dataset.icon = wantIcon;
      if (wantIcon) btn.innerHTML = `<img src="${esc(wantIcon)}" alt="">`;
      else btn.textContent = initials(g.name);
    }

    const live = countLive(g.id);
    let dot = btn.querySelector('.dot');
    if (live) {
      if (!dot) { dot = el('span', 'dot'); btn.appendChild(dot); }
      if (dot.textContent !== String(live)) dot.textContent = String(live);
    } else if (dot) {
      dot.remove();
    }
  }

  for (const btn of [...list.children]) {
    if (!seen.has(btn.dataset.guildId)) btn.remove();
  }
}

function countLive(guildId) {
  const p = S.presence[guildId] || {};
  return Object.values(p).reduce((n, arr) => n + arr.length, 0);
}

function renderChannels() {
  const guild = activeGuild();
  $('#guild-name').textContent = guild ? guild.name : 'Selecione um servidor';
  const list = $('#channel-list');
  const textList = $('#text-channel-list');
  if (!guild) { list.innerHTML = ''; textList.innerHTML = ''; return; }

  const presence = S.presence[guild.id] || {};

  // Canais de texto: sem imagem, sem custo recriar toda vez.
  textList.innerHTML = '';
  for (const ch of guild.channels.filter((channel) => channel.type === 'text')) {
    const active = S.activeTextChannelId === ch.id;
    const btn = el('button', 'channel text-channel' + (active ? ' active' : ''));
    btn.innerHTML = `<span class="text-hash">#</span><span class="channel-name">${esc(ch.name)}</span>`;
    btn.onclick = () => openTextChannel(guild.id, ch.id);
    textList.appendChild(btn);
  }

  // Salas de voz: o botão em si é barato, mas os avatares de quem está
  // dentro NÃO podem ser recriados a cada chamada — presence:update chega
  // toda vez que alguém liga/desliga o indicador de "falando", ou seja,
  // várias vezes por minuto numa conversa normal. Recriar o <img> do
  // avatar nessa frequência é o que causa o piscar.
  const oldOccupantBoxes = new Map(); // channelId -> box antigo, pra reaproveitar as linhas
  for (const box of $$('.occupants', list)) oldOccupantBoxes.set(box.dataset.channelId, box);

  list.innerHTML = '';
  for (const ch of guild.channels.filter((channel) => channel.type !== 'text')) {
    const here = presence[ch.id] || [];
    const active = S.voice && S.voice.guildId === guild.id && S.voice.channelId === ch.id;

    const btn = el('button', 'channel' + (active ? ' active' : ''));
    btn.innerHTML = `<span class="i">${icon('speaker', 17)}</span>
                     <span class="channel-name">${esc(ch.name)}</span>
                     ${here.length ? `<span class="channel-count">${here.length}</span>` : ''}`;
    btn.onclick = () => joinVoice(guild.id, ch.id);
    list.appendChild(btn);

    if (here.length) {
      const oldBox = oldOccupantBoxes.get(ch.id);
      const box = el('div', 'occupants');
      box.dataset.channelId = ch.id;
      const seenSids = new Set();

      for (const p of here) {
        seenSids.add(p.sid);
        const isMe = S.me && p.user.id === S.me.id;
        let rowEl = oldBox && oldBox.querySelector(`[data-sid="${p.sid}"]`);
        if (rowEl) rowEl.remove(); // tira do box velho, reaproveita no novo
        else rowEl = el('button', 'occupant');
        rowEl.dataset.sid = p.sid;

        rowEl.classList.toggle('speaking', !!(p.state && p.state.speaking));

        // Só reconstrói o miolo (com o <img> do avatar) se algo visual mudou de verdade.
        const cacheKey = `${p.user.id}|${p.user.avatar}|${p.user.name}|${p.user.color}|${isMe}`;
        if (rowEl.dataset.cacheKey !== cacheKey) {
          rowEl.dataset.cacheKey = cacheKey;
          rowEl.innerHTML = `${avatarHTML(p.user, 'sm')}<span class="nm">${esc(p.user.name)}${isMe ? ' (você)' : ''}</span><span class="tags"></span>`;
          rowEl.onclick = () => showProfile(p.user);
          rowEl.oncontextmenu = (e) => showUserMenu(e, p.user);
        }
        rowEl.querySelector('.tags').innerHTML =
          `${p.state && p.state.screen ? `<span class="tag screen" title="Transmitindo">${icon('monitor', 11)}</span>` : ''}`
          + `${p.state && !p.state.mic ? `<span class="tag muted" title="Microfone fechado">${icon('micOff', 11)}</span>` : ''}`;

        box.appendChild(rowEl);
      }
      list.appendChild(box);
    }
  }
}

function renderMe() {
  if (!S.me) return;
  $('#me-avatar-slot').innerHTML = avatarHTML(S.me);
  $('#me-name').textContent = S.me.name;
  $('#me-status').textContent = S.voice ? 'Em uma sala' : 'Disponível';
}

function renderStage() {
  const guild = activeGuild();
  const inVoice = !!S.voice;
  const inText = !!S.activeTextChannelId;

  $('#controls').classList.toggle('hidden', !inVoice);
  $('#stage-wrap').classList.toggle('hidden', !inVoice || inText);
  $('#stage-empty').classList.toggle('hidden', inVoice || inText);
  $('#text-chat').classList.toggle('hidden', !inText);

  if (inText) {
    const channel = activeGuild() && activeGuild().channels.find((c) => c.id === S.activeTextChannelId);
    $('#stage-title').textContent = channel ? `# ${channel.name}` : 'Canal de texto';
    $('#stage-conn').textContent = inVoice ? 'Em chamada' : 'Conversa privada';
    return;
  }

  if (!inVoice) {
    if (!guild) {
      $('#stage-title').textContent = 'Nenhuma sala';
      $('#empty-title').textContent = 'Crie um servidor para começar';
      $('#empty-sub').textContent = 'Servidores são privados: só entra quem tiver o link de convite.';
    } else {
      $('#stage-title').textContent = guild.name;
      $('#empty-title').textContent = 'Entre em uma sala';
      $('#empty-sub').textContent = 'Clique em uma sala à esquerda para conversar e compartilhar sua tela.';
    }
    $('#stage-conn').textContent = '';
    clearTiles();
    return;
  }

  const g = S.guilds.find((x) => x.id === S.voice.guildId);
  const ch = g && g.channels.find((c) => c.id === S.voice.channelId);
  $('#stage-title').textContent = ch ? `${g.name} › ${ch.name}` : 'Sala';
  $('#stage-conn').textContent = Voice.peers.size
    ? `${Voice.peers.size + 1} participantes`
    : 'Só você por aqui';

  renderControls();
  renderStageContent();
}

function messageKey(guildId, channelId) { return `${guildId}/${channelId}`; }

async function openTextChannel(guildId, channelId) {
  S.activeGuildId = guildId;
  S.activeTextChannelId = channelId;
  const key = messageKey(guildId, channelId);
  try {
    // Mesmo que um aviso novo tenha chegado enquanto o canal estava fechado,
    // recarrega o histórico para não mostrar só a última mensagem.
    const res = await ask('message:history', { guildId, channelId });
    S.messages.set(key, res.messages || []);
  } catch (err) { toast('Não consegui carregar as mensagens: ' + err.message); }
  renderAll();
  $('#message-input').focus();
}

function renderTextChannel() {
  const box = $('#message-list');
  if (!box || !S.activeTextChannelId) return;
  const messages = S.messages.get(messageKey(S.activeGuildId, S.activeTextChannelId)) || [];
  if (!messages.length) {
    box.innerHTML = '<div class="message-empty"><b>Comece a conversa</b><span>As mensagens deste canal ficam salvas no servidor.</span></div>';
    return;
  }
  box.innerHTML = messages.map((message) => {
    const user = message.user || activeGuild()?.members.find((member) => member.id === message.userId) || { name: 'Desconhecido', color: '#5865f2' };
    const when = new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `<article class="message"><div>${avatarHTML(user, 'sm')}</div><div class="message-body"><div><b>${esc(user.name)}</b><time>${when}</time></div><p>${esc(message.text).replace(/\n/g, '<br>')}</p></div></article>`;
  }).join('');
  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}

function renderControls() {
  const open = Voice.micOpen();
  const ptt = Settings.get('micMode') === 'ptt';
  $('#btn-mic').classList.toggle('on', open);
  $('#btn-mic').classList.toggle('off', !open && Voice.micEnabled === false);
  setIcon($('#ico-mic'), open ? 'mic' : 'micOff', 18);
  $('#btn-mic .ctl-txt').textContent = ptt
    ? (Voice.micEnabled ? 'Aperte ' + teclaNome(Settings.get('pttKey')) : 'Mudo')
    : (open ? 'Microfone' : 'Mudo');

  const sharing = Voice.isSharing();
  $('#btn-screen').classList.toggle('live', sharing);
  setIcon($('#ico-screen'), sharing ? 'screenOff' : 'screenShare', 18);
  $('#txt-screen').textContent = sharing ? 'Parar de transmitir' : 'Compartilhar tela';
  $('#txt-quality').textContent = Voice.quality.label.replace(' ', '');

  renderShareHud(open, sharing);
}

/** Painel flutuante estilo Slack: só aparece pra quem está transmitindo. */
function renderShareHud(micOpen, sharing) {
  $('#share-hud').classList.toggle('hidden', !sharing);
  if (!sharing) return;
  $('#hud-mic').classList.toggle('on', micOpen);
  $('#hud-mic').classList.toggle('off', !micOpen);
  setIcon($('#hud-ico-mic'), micOpen ? 'mic' : 'micOff', 16);
  $('#hud-pen').classList.toggle('on', Annot.isActive('local'));
  const previewHidden = !!Voice.previewHidden;
  $('#hud-preview').classList.toggle('on', previewHidden);
  setIcon($('#hud-ico-preview'), previewHidden ? 'eyeOff' : 'eye', 16);
}

/* ------------------------------------------------- grade e destaque ---- */

function clearTiles() {
  for (const t of tiles.values()) t.el.remove();
  tiles.clear();
  Annot.detachAll();
  for (const sid of [...audioEls.keys()]) dropAudio(sid);
}

function tileFor(id) {
  let t = tiles.get(id);
  if (t) return t;

  const node = el('div', 'tile');
  node.innerHTML = `
    <video autoplay playsinline class="hidden"></video>
    <div class="tile-idle">
      <span class="avatar lg"></span>
      <div class="who"></div>
    </div>
    <div class="tile-watch hidden">
      <div class="tile-watch-bg"></div>
      <span class="tile-watch-live">${icon('zap', 12)} AO VIVO</span>
      <button class="tile-watch-btn btn btn-primary">${icon('eye', 16)} Assistir transmissão</button>
    </div>
    <div class="tile-badge hidden"></div>
    <div class="tile-bar">
      <span class="tile-name"></span>
      <input type="range" min="0" max="100" value="100" title="Volume" class="vol hidden">
      <button class="pen hidden" title="Rabiscar na tela (P)">${icon('pen', 16)}</button>
      <button class="unwatch hidden" title="Parar de assistir">${icon('eyeOff', 16)}</button>
      <button class="pip hidden" title="Janela flutuante">${icon('pip', 16)}</button>
      <button class="focus" title="Destacar">${icon('maximize', 16)}</button>
      <button class="fs" title="Tela cheia">${icon('expand', 16)}</button>
    </div>`;

  const video = node.querySelector('video');
  node.querySelector('.tile-watch-btn').onclick = (e) => {
    e.stopPropagation();
    Voice.watchPeer(id);
    S.watching.add(id);
    renderStageContent();
  };

  node.querySelector('.fs').onclick = (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen().catch((err) => toast('Tela cheia indisponível: ' + err.message));
  };
  node.querySelector('.pip').onclick = (e) => {
    e.stopPropagation();
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else video.requestPictureInPicture().catch((err) => toast('Janela flutuante indisponível: ' + err.message));
  };
  node.querySelector('.unwatch').onclick = (e) => {
    e.stopPropagation();
    Voice.unwatchPeer(id);
    S.watching.delete(id);
    if (S.focusId === id) S.focusId = null;
    renderStageContent();
  };
  node.querySelector('.focus').onclick = (e) => {
    e.stopPropagation();
    S.focusId = S.focusId === id ? null : id;
    renderStageContent();
  };
  node.querySelector('.pen').onclick = (e) => {
    e.stopPropagation();
    Annot.setActive(Annot.isActive(id) ? null : id);
    syncAnnotBars();
  };
  node.querySelector('.vol').oninput = (e) => {
    e.stopPropagation();
    video.volume = e.target.value / 100;
  };

  t = { el: node, video, streamId: null, annotActive: false };
  tiles.set(id, t);
  return t;
}

function paintTile(id, info) {
  const { user, stream, isLocal, sharing, intendsScreen, speaking, status, canAnnotate } = info;
  const t = tileFor(id);
  const { el: node, video } = t;
  const notWatchingYet = !isLocal && intendsScreen && !sharing && !S.watching.has(id);

  node.classList.toggle('speaking', !!speaking);
  node.classList.toggle('focused', S.focusId === id);

  if (stream && sharing) {
    if (t.streamId !== stream.id) {
      video.srcObject = stream;
      t.streamId = stream.id;
      video.muted = !!isLocal;              // nunca tocar o próprio áudio (eco)
      video.play().catch(() => showUnmute(node, video));
      if (!isLocal) App.applySink();
    }
    video.classList.remove('hidden');
    node.querySelector('.tile-idle').classList.add('hidden');
    node.querySelector('.tile-watch').classList.add('hidden');
    node.querySelector('.pip').classList.toggle('hidden', !!isLocal);
    node.querySelector('.vol').classList.toggle('hidden', !!isLocal);
    node.querySelector('.pen').classList.toggle('hidden', !canAnnotate);
    node.querySelector('.unwatch').classList.toggle('hidden', !!isLocal);
  } else if (notWatchingYet) {
    // Anunciou que está compartilhando, mas eu ainda não pedi pra assistir
    // — só mostra a prévia (se tiver chegado alguma) e o botão, sem gastar
    // banda recebendo o vídeo de verdade até eu clicar.
    if (t.streamId) { video.srcObject = null; t.streamId = null; }
    video.classList.add('hidden');
    node.querySelector('.tile-idle').classList.add('hidden');
    const watch = node.querySelector('.tile-watch');
    watch.classList.remove('hidden');
    const preview = S.previews.get(id);
    if (watch.dataset.preview !== (preview || '')) {
      watch.dataset.preview = preview || '';
      watch.querySelector('.tile-watch-bg').style.backgroundImage = preview ? `url('${preview}')` : '';
    }
    for (const sel of ['.pip', '.vol', '.pen', '.unwatch']) node.querySelector(sel).classList.add('hidden');
  } else {
    if (t.streamId) { video.srcObject = null; t.streamId = null; }
    video.classList.add('hidden');
    node.querySelector('.tile-watch').classList.add('hidden');
    const idle = node.querySelector('.tile-idle');
    idle.classList.remove('hidden');
    const av = idle.querySelector('.avatar');
    // renderStageContent() roda a cada 2s e a cada troca de estado — sem
    // esse cache, o <img> do avatar seria recriado (e piscaria) o tempo
    // todo mesmo sem nada visual mudar de verdade.
    const avatarKey = `${user.avatar}|${user.name}|${user.color}`;
    if (av.dataset.cacheKey !== avatarKey) {
      av.dataset.cacheKey = avatarKey;
      if (user.avatar) av.innerHTML = `<img src="${assetUrl(esc(user.avatar))}" alt="">`;
      else { av.innerHTML = ''; av.textContent = initials(user.name); av.style.background = user.color; }
    }
    idle.querySelector('.who').textContent = status || (isLocal ? 'Você' : 'Sem tela compartilhada');
    for (const sel of ['.pip', '.vol', '.pen', '.unwatch']) node.querySelector(sel).classList.add('hidden');
  }

  const live = sharing || intendsScreen;
  const badge = node.querySelector('.tile-badge');
  badge.classList.toggle('hidden', !live);
  badge.classList.toggle('live', !!live);
  badge.textContent = live ? (isLocal ? 'TRANSMITINDO' : 'AO VIVO') : '';

  node.querySelector('.tile-name').textContent = isLocal ? `${user.name} (você)` : user.name;
  const foco = node.querySelector('.focus');
  foco.innerHTML = S.focusId === id ? icon('grid', 16) : icon('maximize', 16);
  foco.title = S.focusId === id ? 'Voltar à grade' : 'Destacar';

  // camada de rabisco
  if (sharing && stream) {
    Annot.attach(node, id);
    syncAnnotBar(id, t);
  } else if (Annot.layers.has(id)) {
    Annot.detach(id);
  }
  return t;
}

function syncAnnotBar(id, t) {
  const active = Annot.isActive(id);
  const bar = t.el.querySelector('.annot-bar');
  t.el.querySelector('.pen').classList.toggle('on', active);
  if (active && !bar) {
    t.el.appendChild(Annot.toolbar(id, () => { rebuildAnnotBar(id, t); }));
  } else if (!active && bar) {
    bar.remove();
  }
}

function rebuildAnnotBar(id, t) {
  const bar = t.el.querySelector('.annot-bar');
  if (bar) bar.remove();
  syncAnnotBar(id, t);
}

function syncAnnotBars() {
  for (const [id, t] of tiles) syncAnnotBar(id, t);
}

function showUnmute(node, video) {
  if (node.querySelector('.tile-unmute')) return;
  const btn = el('button', 'tile-unmute',
    `<span class="i">${icon('volume', 20)}</span><span>Clique para ativar o som</span>`);
  btn.onclick = (e) => { e.stopPropagation(); video.play(); btn.remove(); };
  node.appendChild(btn);
}

/** Monta a lista do que deve aparecer no palco agora. */
function stageEntries() {
  const entries = [];

  if (Voice.isSharing() && Settings.get('selfPreview')) {
    entries.push({
      id: 'local', user: S.me, stream: Voice.local.screenStream,
      isLocal: true, sharing: true, intendsScreen: true,
      speaking: Voice.speaking, canAnnotate: true,
    });
  }

  for (const peer of Voice.peers.values()) {
    const sharing = !!(peer.state && peer.state.screen);
    const screen = sharing ? peer.screenStream() : null;
    const conn = peer.pc.connectionState;
    const status = conn === 'connected' || conn === 'completed'
      ? 'Sem tela compartilhada'
      : conn === 'failed' ? 'Falha na conexão' : 'Conectando…';

    entries.push({
      id: peer.sid, user: peer.user, stream: screen,
      isLocal: false,
      // 'sharing' é o que dá para exibir agora; 'intendsScreen' é o que a
      // pessoa anunciou. A mídia chega alguns instantes depois do aviso, e o
      // destaque precisa sobreviver a essa janela.
      sharing: sharing && !!screen,
      intendsScreen: sharing,
      speaking: peer.state && peer.state.speaking,
      canAnnotate: !!(peer.state && peer.state.annot !== false),
      status,
    });
    attachAudio(peer);
  }

  if (!entries.length) {
    entries.push({
      id: 'waiting', user: S.me || { name: '?', color: 'var(--accent)' },
      isLocal: true, sharing: false,
      status: 'Convide seus amigos ou comece a transmitir',
    });
  }
  return entries;
}

function renderStageContent() {
  if (!S.voice || !S.me) return;
  const entries = stageEntries();
  const byId = new Map(entries.map((e) => [e.id, e]));

  // Só desiste do destaque quando a pessoa saiu ou parou de transmitir de
  // fato — não enquanto a mídia dela ainda está a caminho.
  const wanted = S.focusId ? byId.get(S.focusId) : null;
  if (S.focusId && (!wanted || !wanted.intendsScreen)) S.focusId = null;
  const focus = S.focusId && wanted && wanted.sharing ? wanted : null;

  const grid = $('#grid');
  const main = $('#focus-main');
  const strip = $('#filmstrip');

  grid.classList.toggle('hidden', !!focus);
  main.classList.toggle('hidden', !focus);
  strip.classList.toggle('hidden', !focus);

  for (const entry of entries) {
    const t = paintTile(entry.id, entry);
    const parent = focus
      ? (entry.id === S.focusId ? main : strip)
      : grid;
    if (t.el.parentElement !== parent) parent.appendChild(t.el);

    const inStrip = focus && entry.id !== S.focusId;
    t.el.classList.toggle('clickable', !!inStrip);
    t.el.onclick = inStrip ? () => { S.focusId = entry.id; renderStageContent(); } : null;
  }

  for (const [id, t] of tiles) {
    if (!byId.has(id)) {
      t.el.remove();
      tiles.delete(id);
      Annot.detach(id);
    }
  }
  grid.classList.toggle('solo', !focus && entries.length === 1);
}

/** Áudio de microfone toca num <audio> próprio, fora da grade. */
function attachAudio(peer) {
  const mic = peer.micStream();
  let node = audioEls.get(peer.sid);
  if (!mic) {
    if (node) dropAudio(peer.sid);
    return;
  }
  if (!node) {
    node = document.createElement('audio');
    node.autoplay = true;
    document.body.appendChild(node);
    audioEls.set(peer.sid, node);
  }
  if (node.srcObject !== mic) {
    node.srcObject = mic;
    node.play().catch(() => {});
    App.applySink();
  }
  applyPeerVolume(peer.sid, node);
}

function dropAudio(sid) {
  const node = audioEls.get(sid);
  if (!node) return;
  node.srcObject = null;
  node.remove();
  audioEls.delete(sid);
}

/**
 * Volume final de um peer: 0 se foi mutado localmente (só pra mim, não
 * afeta os outros), senão o volume individual que eu ajustei (padrão 1),
 * abaixado ainda mais enquanto eu compartilho áudio do sistema — pra voz
 * da call vazar menos na minha transmissão (não some 100%, é limitação do
 * Windows: o loopback pega tudo que sai pelos alto-falantes).
 */
function applyPeerVolume(sid, node) {
  if (S.localMutes.has(sid)) { node.volume = 0; return; }
  const base = S.localVolumes.get(sid);
  const vol = base == null ? 1 : base;
  const sharingWithAudio = Voice.isSharing()
    && Voice.local.screenStream && Voice.local.screenStream.getAudioTracks().length > 0;
  const duck = sharingWithAudio && Settings.get('duckVoiceOnShare') !== false ? 0.25 : 1;
  node.volume = clamp(vol * duck, 0, 1);
}

function refreshAllPeerVolumes() {
  for (const [sid, node] of audioEls) applyPeerVolume(sid, node);
}

/* ------------------------------------------------- eventos do motor ---- */

Voice.on('peerschange', () => renderStage());
Voice.on('peerchange', () => { renderStageContent(); renderChannels(); });
Voice.on('localchange', () => { renderControls(); renderStageContent(); });
Voice.on('notice', (msg) => toast(msg, 6000));
Voice.on('screenstart', () => {
  if (Settings.get('autoFocus') && Settings.get('selfPreview')) S.focusId = 'local';
  renderStageContent();
  refreshAllPeerVolumes();
  toast('Você começou a transmitir sua tela.');
  feedback('screenstart');
});
Voice.on('screenstop', () => {
  if (S.focusId === 'local') S.focusId = null;
  renderStageContent();
  refreshAllPeerVolumes();
  toast('Você parou de transmitir.');
  feedback('screenstop');
});
Voice.on('qualitydowngraded', () => renderControls());

/* ========================================================= entrar/sair == */

async function joinVoice(guildId, channelId) {
  if (!S.me) return toast('Ainda conectando… tente de novo em um instante.');
  if (S.voice && S.voice.guildId === guildId && S.voice.channelId === channelId) return;
  if (S.voice) await leaveVoice({ silent: true });

  try {
    const res = await ask('voice:join', { guildId, channelId });
    S.voice = { guildId, channelId };
    S.activeTextChannelId = null;
    await Voice.start();
    for (const info of res.peers) {
      Voice.addPeer(info);
      // Alguém já estava transmitindo quando entramos: destaca essa tela.
      if (info.state && info.state.screen) {
        S.sharingSeen.add(info.sid);
        if (Settings.get('autoFocus') && !S.focusId) S.focusId = info.sid;
      }
    }
    Voice.publishState();
    renderAll();
    toast('Você entrou na sala.');
    feedback('join');
  } catch (err) {
    toast('Não foi possível entrar: ' + err.message);
  }
}

async function leaveVoice({ silent } = {}) {
  if (!S.voice) return;
  S.voice = null;
  S.focusId = null;
  S.sharingSeen.clear();
  Voice.stop();
  clearTiles();
  try { await ask('voice:leave', {}); } catch {}
  if (!silent) toast('Você saiu da sala.');
  renderAll();
}

/* ======================================================== ações de UI === */

function wireActions() {
  $('#btn-create').onclick = () => openModal({
    title: 'Criar servidor',
    body: `<p>Servidores são privados. Só entra quem receber seu convite.</p>
           <label for="in-guild">Nome do servidor</label>
           <input id="in-guild" type="text" maxlength="48" placeholder="Ex: Turma do LoL">`,
    okText: 'Criar',
    onOk: () => {
      const name = $('#in-guild').value.trim();
      if (!name) { toast('Dê um nome ao servidor.'); return false; }
      ask('guild:create', { name })
        .then(({ guild }) => {
          S.guilds.push(guild);
          S.activeGuildId = guild.id;
          renderAll();
          showInvite(guild);
        })
        .catch((e) => toast(e.message));
    },
  });

  $('#btn-join').onclick = () => openModal({
    title: 'Entrar com convite',
    body: `<p>Cole o código ou o link que seu amigo enviou.</p>
           <label for="in-invite">Convite</label>
           <input id="in-invite" type="text" placeholder="ABCD2345 ou https://…#invite=ABCD2345">`,
    okText: 'Entrar',
    onOk: () => {
      const raw = $('#in-invite').value.trim();
      const code = (raw.match(/invite=([A-Za-z0-9]+)/) || [null, raw])[1].toUpperCase();
      if (!code) { toast('Informe o convite.'); return false; }
      joinByCode(code);
    },
  });

  $('#btn-settings').onclick = () => SettingsUI.open();
  $('#me-card').onclick = () => SettingsUI.open('conta');

  $('#btn-mic').onclick = () => Voice.toggleMic();
  $('#btn-hangup').onclick = () => leaveVoice();
  $('#btn-screen').onclick = () => {
    if (Voice.isSharing()) Voice.stopScreen();
    else Voice.startScreen();
  };
  $('#btn-quality').onclick = () => SettingsUI.open('transmissao');
  $('#btn-stats').onclick = showStats;

  $('#message-form').onsubmit = (event) => {
    event.preventDefault();
    const text = $('#message-input').value.trim();
    if (!text || !S.activeGuildId || !S.activeTextChannelId) return;
    $('#message-input').value = '';
    ask('message:send', { guildId: S.activeGuildId, channelId: S.activeTextChannelId, text })
      .catch((err) => { $('#message-input').value = text; toast('Não consegui enviar: ' + err.message); });
  };
  $('#message-input').onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('#message-form').requestSubmit();
    }
  };

  $('#btn-guild-menu').onclick = (e) => {
    e.stopPropagation();
    $('#guild-menu').classList.toggle('hidden');
  };
  document.addEventListener('click', () => $('#guild-menu').classList.add('hidden'));
  document.addEventListener('click', closeUserMenu);
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('.user-menu')) closeUserMenu(); });
  $('#guild-menu').onclick = onGuildMenu;

  $('#btn-toggle-members').onclick = () => {
    const open = $('#members-sidebar').classList.toggle('hidden');
    LS.set('membersOpen', !open);
  };
  if (LS.get('membersOpen', true) === false) $('#members-sidebar').classList.add('hidden');

  $('#hud-toggle').onclick = () => {
    const collapsed = $('#share-hud').classList.toggle('collapsed');
    setIcon($('#hud-toggle span'), collapsed ? 'expand' : 'minimize', 14);
  };
  $('#hud-mic').onclick = () => Voice.toggleMic();
  $('#hud-pen').onclick = () => {
    Annot.setActive(Annot.isActive('local') ? null : 'local');
    syncAnnotBars();
    renderControls();
  };
  $('#hud-preview').onclick = () => {
    Voice.setPreviewHidden(!Voice.previewHidden);
    renderControls();
  };
  $('#hud-stop').onclick = () => Voice.stopScreen();
}

function joinByCode(code) {
  ask('guild:join', { invite: code })
    .then(({ guild }) => {
      if (!S.guilds.some((g) => g.id === guild.id)) S.guilds.push(guild);
      S.activeGuildId = guild.id;
      renderAll();
      toast(`Você entrou em ${guild.name}.`);
    })
    .catch((e) => toast(e.message));
}

function showInvite(guild) {
  const link = `${serverOrigin()}/#invite=${guild.invite}`;
  openModal({
    title: 'Convidar amigos',
    body: `<p>Qualquer pessoa com este link entra em <b>${esc(guild.name)}</b>.</p>
           <label>Link de convite</label>
           <div class="copyrow"><input id="in-link" type="text" readonly value="${esc(link)}"></div>
           <label>Código</label>
           <div class="copyrow"><input id="in-code" type="text" readonly value="${esc(guild.invite)}"></div>`,
    okText: 'Copiar link',
    onOk: () => copyText(link, 'Link copiado!'),
  });
}

function onGuildMenu(e) {
  const act = e.target.dataset.act;
  const guild = activeGuild();
  if (!act || !guild) return;
  $('#guild-menu').classList.add('hidden');

  if (act === 'invite') showInvite(guild);

  if (act === 'regen') {
    ask('guild:regenInvite', { guildId: guild.id })
      .then(({ invite }) => { guild.invite = invite; showInvite(guild); })
      .catch((err) => toast(err.message));
  }

  if (act === 'icon') {
    pickImage({ maxBytes: 8 * 1024 * 1024 }).then(async (dataUrl) => {
      if (!dataUrl) return;
      try {
        const url = await uploadImage(dataUrl, 'guild', S.me.id);
        await ask('guild:update', { guildId: guild.id, icon: url });
        toast('Ícone atualizado.');
      } catch (err) { toast('Falhou: ' + err.message); }
    });
  }

  if (act === 'newtext' || act === 'newvoice') openModal({
    title: act === 'newtext' ? 'Criar canal de texto' : 'Criar sala de voz',
    body: `<label for="in-ch">Nome da sala</label>
           <input id="in-ch" type="text" maxlength="32" placeholder="Ex: ${act === 'newtext' ? 'conversa-geral' : 'Sala 2'}">`,
    okText: 'Criar',
    onOk: () => {
      const name = $('#in-ch').value.trim();
      if (!name) return false;
      ask('channel:create', { guildId: guild.id, name, type: act === 'newtext' ? 'text' : 'voice' })
        .then(({ guild: g }) => {
          const i = S.guilds.findIndex((x) => x.id === g.id);
          if (i !== -1) S.guilds[i] = g;
          renderAll();
        })
        .catch((err) => toast(err.message));
    },
  });

  if (act === 'leave') {
    confirmModal({
      title: 'Sair do servidor',
      body: `Você vai perder o acesso a <b>${esc(guild.name)}</b> e precisará de um novo convite para voltar.`,
      okText: 'Sair', danger: true,
    }).then((ok) => {
      if (!ok) return;
      ask('guild:leave', { guildId: guild.id })
        .then(() => {
          S.guilds = S.guilds.filter((g) => g.id !== guild.id);
          if (S.voice && S.voice.guildId === guild.id) leaveVoice({ silent: true });
          S.activeGuildId = S.guilds.length ? S.guilds[0].id : null;
          renderAll();
        })
        .catch((err) => toast(err.message));
    });
  }

  if (act === 'delete') {
    confirmModal({
      title: 'Excluir servidor',
      body: `Isso apaga <b>${esc(guild.name)}</b> para todos os membros. Não dá para desfazer.`,
      okText: 'Excluir', danger: true,
    }).then((ok) => {
      if (ok) ask('guild:delete', { guildId: guild.id }).catch((err) => toast(err.message));
    });
  }
}

async function showStats() {
  const text = await Voice.report();
  openModal({
    title: 'Status da conexão',
    body: `<div class="statbox" id="statbox">${esc(text)}</div>`,
    okText: 'Fechar', showCancel: false, onOk: () => {},
  });
  const timer = setInterval(async () => {
    const box = $('#statbox');
    if (!box || !modalOpen()) return clearInterval(timer);
    box.textContent = await Voice.report();
  }, 1000);
}

/* ============================================================ teclado === */

function wireKeyboard() {
  const typing = (e) => e.target.matches('input, select, textarea') || e.target.isContentEditable;

  document.addEventListener('keydown', (e) => {
    if (e.repeat) {
      // Apertar para falar: segurar a tecla não deve repetir a ação.
      if (!typing(e) && e.code === Settings.get('pttKey')) e.preventDefault();
      return;
    }
    if (typing(e)) {
      if (e.key === 'Enter' && modalOpen()) $('#modal-ok').click();
      return;
    }
    if (e.key === 'Escape') {
      if (modalOpen()) return closeModal();
      // Durante o download não fecha: sair no meio confunde mais que ajuda.
      if (Updater.isOpen() && Updater.state.status !== 'downloading') return Updater.close();
      if (SettingsUI.isOpen()) return SettingsUI.close();
      if (S.focusId) { S.focusId = null; return renderStageContent(); }
      if (Annot.active) { Annot.setActive(null); return syncAnnotBars(); }
    }

    if (S.voice && Settings.get('micMode') === 'ptt' && e.code === Settings.get('pttKey')) {
      e.preventDefault();
      Voice.setPtt(true);
      return;
    }
    if (!S.voice || modalOpen() || SettingsUI.isOpen()) return;

    const k = e.key.toLowerCase();
    if (k === 'm') Voice.toggleMic();
    if (k === 's') $('#btn-screen').click();
    if (k === 'p') {
      const target = S.focusId || [...tiles.keys()].find((id) => tiles.get(id).el.querySelector('.pen:not(.hidden)'));
      if (target) { Annot.setActive(Annot.isActive(target) ? null : target); syncAnnotBars(); }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === Settings.get('pttKey')) Voice.setPtt(false);
  });

  // Se a janela perder o foco com a tecla apertada, fecha o microfone.
  window.addEventListener('blur', () => Voice.setPtt(false));
  window.addEventListener('beforeunload', () => { if (S.voice) Voice.stop(); });
}

/* ============================================================== boot ==== */

Settings.on((key) => {
  if (key === 'quality') Voice.setQuality(Settings.get('quality'));
  if (key === 'contentHint') Voice.setContentHint(Settings.get('contentHint'));
  if (key === '*') { Voice.setQuality(Settings.get('quality')); renderAll(); }
});

// Dispositivos podem ser plugados/desplugados com o app aberto.
if (navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (SettingsUI.isOpen()) SettingsUI.open();
  });
}

/** Mostra perfil e servidores salvos localmente antes mesmo do socket conectar. */
function hydrateCache() {
  const guilds = LS.get('guildsCache', []);
  const me = LS.get('profileCache', null);
  const friends = LS.get('friendsCache', []);
  if (Array.isArray(guilds) && guilds.length) S.guilds = guilds;
  if (me) S.me = me;
  if (Array.isArray(friends)) S.friends = new Set(friends);
  if (!S.activeGuildId && S.guilds.length) S.activeGuildId = S.guilds[0].id;
  if (S.guilds.length || S.me) renderAll();
}

async function boot() {
  hydrateIcons();          // troca os marcadores data-icon do HTML pelos SVGs
  wireModal();
  wireActions();
  wireGate();
  wireKeyboard();
  installScreenPicker();
  Updater.init();
  Settings.apply();
  hydrateCache();

  // O painel de desenvolvedor pode apontar o app pra outro servidor (testes).
  if (isDesktop()) {
    try {
      const info = await window.desktop.info();
      if (info && info.serverUrlOverride) {
        window.ENV = window.ENV || {};
        window.ENV.SERVER_URL = info.serverUrlOverride;
      }
    } catch (err) { console.warn('[boot] info do desktop:', err.message); }
  }

  connect();
  // O status de conexão de cada par muda sem evento; refresca de leve.
  setInterval(() => { if (S.voice) renderStageContent(); }, 2000);
}

document.addEventListener('DOMContentLoaded', boot);

window.App = App;
