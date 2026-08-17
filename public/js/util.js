/* ==========================================================================
   util.js — helpers compartilhados: DOM, avisos, modais, imagens
   ========================================================================== */

'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const initials = (name) => String(name || '').trim().slice(0, 2).toUpperCase() || '??';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function assetUrl(path) {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('http')) return path;
  const base = window.ENV && window.ENV.SERVER_URL ? window.ENV.SERVER_URL : '';
  return base + path;
}

/**
 * Base pra montar links de convite. No navegador, hospedado pelo próprio
 * servidor, `location.origin` já é o endereço certo. No app desktop a
 * página é carregada com `file://` (não existe mais servidor embutido), e
 * `location.origin` aponta pra lugar nenhum — por isso usamos o mesmo
 * `SERVER_URL` da conexão sempre que ele existir.
 */
function serverOrigin() {
  const base = window.ENV && window.ENV.SERVER_URL;
  return base || location.origin;
}

/** HTML de um avatar, com imagem quando o usuário tiver uma. */
function avatarHTML(user, size = '', extraClass = '') {
  const cls = ['avatar', size, extraClass].filter(Boolean).join(' ');
  if (user && user.avatar) {
    return `<span class="${cls}"><img src="${assetUrl(esc(user.avatar))}" alt=""></span>`;
  }
  const bg = (user && user.color) || 'var(--accent)';
  return `<span class="${cls}" style="background:${esc(bg)}">${esc(initials(user && user.name))}</span>`;
}

/* ------------------------------------------------------------ avisos --- */

let toastTimer;
function toast(msg, ms = 4200) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  // Reinicia a animação de entrada mesmo se já estiver visível.
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

/* Feedback curto, sem arquivos de áudio e sem interromper a chamada. O
 * AudioContext só é criado depois da primeira ação do usuário; navegadores
 * que bloqueiam som automático simplesmente mantêm o aviso visual. */
let feedbackCtx = null;
function feedback(kind = 'message') {
  document.body.classList.remove('feedback-flash');
  void document.body.offsetWidth;
  document.body.classList.add('feedback-flash');
  setTimeout(() => document.body.classList.remove('feedback-flash'), 520);
  if (window.Settings && Settings.get('feedbackSounds') === false) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    feedbackCtx = feedbackCtx || new Ctx();
    if (feedbackCtx.state === 'suspended') feedbackCtx.resume().catch(() => {});
    const profile = {
      join: [660, 880], leave: [420, 280], screenstart: [520, 780],
      screenstop: [780, 440], message: [720],
    }[kind] || [620];
    profile.forEach((freq, i) => {
      const osc = feedbackCtx.createOscillator();
      const gain = feedbackCtx.createGain();
      const start = feedbackCtx.currentTime + i * 0.075;
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.045, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.10);
      osc.connect(gain).connect(feedbackCtx.destination);
      osc.start(start); osc.stop(start + 0.11);
    });
  } catch { /* feedback visual continua disponível */ }
}

/* ------------------------------------------------------------ modais --- */

let modalOk = null;
let modalOnClose = null;

/**
 * Abre o modal genérico.
 * onOk pode devolver false para manter o modal aberto (validação falhou).
 */
function openModal({ title, body, okText = 'Confirmar', cancelText = 'Cancelar',
                     showCancel = true, showOk = true, wide = false, onOk, onClose }) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;
  $('#modal-ok').textContent = okText;
  $('#modal-cancel').textContent = cancelText;
  $('#modal-ok').classList.toggle('hidden', !showOk);
  $('#modal-cancel').classList.toggle('hidden', !showCancel);
  $('#modal-card').classList.toggle('wide', !!wide);
  modalOk = onOk;
  modalOnClose = onClose;
  $('#modal').classList.remove('hidden');

  const first = $('#modal-body input:not([type=file]), #modal-body select, #modal-body textarea');
  if (first) setTimeout(() => first.focus(), 40);
}

function closeModal() {
  if ($('#modal').classList.contains('hidden')) return;
  $('#modal').classList.add('hidden');
  const fn = modalOnClose;
  modalOk = null;
  modalOnClose = null;
  if (fn) fn();
}

const modalOpen = () => !$('#modal').classList.contains('hidden');

function wireModal() {
  $('#modal-cancel').onclick = closeModal;
  $('#modal-ok').onclick = () => {
    const fn = modalOk;
    if (!fn || fn() !== false) closeModal();
  };
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
}

/** Confirmação simples, com Promise. */
function confirmModal({ title, body, okText = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    openModal({
      title,
      body: `<p>${body}</p>`,
      okText,
      onOk: () => { done = true; resolve(true); },
      onClose: () => { if (!done) resolve(false); },
    });
    if (danger) $('#modal-ok').classList.add('btn-danger');
    else $('#modal-ok').classList.remove('btn-danger');
  });
}

/* ---------------------------------------------------------- imagens ---- */

/** Abre o seletor de arquivos e devolve um data URL, ou null. */
function pickImage({ maxBytes = 12 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      if (file.size > maxBytes) {
        toast(`Imagem muito grande (máx. ${Math.round(maxBytes / 1024 / 1024)} MB).`);
        return resolve(null);
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => { toast('Não consegui ler o arquivo.'); resolve(null); };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

/** Envia o data URL ao servidor e devolve o caminho salvo (/uploads/...). */
async function uploadImage(dataUrl, kind, userId) {
  const serverUrl = window.ENV && window.ENV.SERVER_URL ? window.ENV.SERVER_URL : '';
  const res = await fetch(serverUrl + '/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, kind, userId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'falha no envio');
  return json.url;
}

function copyText(text, okMsg = 'Copiado!') {
  navigator.clipboard.writeText(text)
    .then(() => toast(okMsg))
    .catch(() => toast('Copie manualmente: ' + text, 8000));
}

/* ----------------------------------------------------- persistência ---- */

const LS_PREFIX = 'dsx:';
const LS_LEGACY_PREFIX = 'd2:';   // prefixo da versão anterior, chamada Discord2

/**
 * Traz as chaves da versão anterior para o prefixo novo.
 * Sem isso, renomear o app faria todo mundo perder identidade, servidores
 * salvos e preferências — o usuário voltaria à tela de apelido do zero.
 */
function migrateLegacyStorage() {
  try {
    if (localStorage.getItem(LS_PREFIX + 'migrated')) return;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LS_LEGACY_PREFIX)) continue;
      const novo = LS_PREFIX + key.slice(LS_LEGACY_PREFIX.length);
      if (localStorage.getItem(novo) === null) {
        localStorage.setItem(novo, localStorage.getItem(key));
      }
    }
    localStorage.setItem(LS_PREFIX + 'migrated', '1');
  } catch { /* modo privado sem storage: segue sem migrar */ }
}
migrateLegacyStorage();

const LS = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch {}
  },
  del(key) {
    try { localStorage.removeItem(LS_PREFIX + key); } catch {}
  },
};

const isDesktop = () => !!(window.desktop && window.desktop.isDesktop);
