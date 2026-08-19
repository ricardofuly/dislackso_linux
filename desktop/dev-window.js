'use strict';

/* Renderer da janela de desenvolvedor — script simples, sem framework. */

const $ = (sel) => document.querySelector(sel);

async function boot() {
  $('#dev-auth-go').onclick = tryAuth;
  $('#dev-password').onkeydown = (e) => { if (e.key === 'Enter') tryAuth(); };
  $('#dev-password').focus();
}

async function tryAuth() {
  const password = $('#dev-password').value;
  const ok = await window.desktopDev.auth(password);
  if (!ok) {
    $('#dev-auth-error').textContent = 'Senha incorreta.';
    $('#dev-auth-error').classList.remove('hidden');
    return;
  }
  $('#dev-auth').classList.add('hidden');
  $('#dev-main').classList.remove('hidden');
  await loadPanel();
}

async function loadPanel() {
  const [info, config, updateState] = await Promise.all([
    window.desktopDev.appInfo(),
    window.desktopDev.getConfig(),
    window.desktopDev.update.state(),
  ]);

  $('#info-version').textContent = info.version;
  $('#info-versions').textContent = `${info.electron} / ${info.chrome} / ${info.node}`;
  $('#info-platform').textContent = info.platform;
  $('#info-datadir').textContent = info.dataDir;
  $('#update-status').textContent = describeUpdate(updateState);

  $('#cfg-hwaccel').checked = !!config.hardwareAcceleration;
  $('#cfg-transparency').checked = !!config.transparency;
  $('#cfg-server-url').value = config.serverUrlOverride || '';
  $('#admin-key').value = config.adminKey || '';

  $('#cfg-hwaccel').onchange = (e) => window.desktopDev.setConfig({ hardwareAcceleration: e.target.checked });
  $('#cfg-transparency').onchange = (e) => window.desktopDev.setConfig({ transparency: e.target.checked });

  $('#btn-save-server-url').onclick = async () => {
    const value = $('#cfg-server-url').value.trim();
    await window.desktopDev.setConfig({ serverUrlOverride: value });
    toastNote('#btn-save-server-url', value ? 'Salvo — recarregue a janela principal.' : 'Voltou ao padrão.');
  };

  $('#btn-open-datadir').onclick = () => window.desktopDev.openDataFolder();

  $('#btn-save-admin-key').onclick = async () => {
    await window.desktopDev.setConfig({ adminKey: $('#admin-key').value.trim() });
    toastNote('#btn-save-admin-key', 'Salva.');
  };

  const adminUser = await window.desktopDev.getAdminUser();
  $('#admin-user-id').value = (adminUser.ok && adminUser.adminUserId) || '';

  $('#btn-save-admin-user').onclick = async () => {
    const res = await window.desktopDev.setAdminUser($('#admin-user-id').value.trim());
    $('#admin-user-msg').textContent = res.ok
      ? (res.adminUserId ? 'Salvo — essa conta agora é admin em qualquer servidor.' : 'Removido.')
      : res.error;
    $('#admin-user-msg').className = res.ok ? 'dev-ok' : 'dev-error';
  };

  $('#btn-send-broadcast').onclick = async () => {
    const message = $('#admin-message').value.trim();
    if (!message) { $('#broadcast-msg').textContent = 'Escreva uma mensagem primeiro.'; $('#broadcast-msg').className = 'dev-error'; return; }
    const forceFocus = $('#admin-force-focus').checked;
    $('#btn-send-broadcast').disabled = true;
    $('#broadcast-msg').textContent = 'Enviando…';
    $('#broadcast-msg').className = 'dev-note';
    const res = await window.desktopDev.broadcast(message, forceFocus);
    $('#btn-send-broadcast').disabled = false;
    if (res.ok) {
      $('#broadcast-msg').textContent = `Enviado — ${res.delivered ?? '?'} conexão(ões) ativa(s) receberam agora.`;
      $('#broadcast-msg').className = 'dev-ok';
      $('#admin-message').value = '';
    } else {
      $('#broadcast-msg').textContent = res.error || 'Falhou.';
      $('#broadcast-msg').className = 'dev-error';
    }
  };

  $('#btn-check-update').onclick = async () => {
    $('#update-status').textContent = 'Verificando…';
    const state = await window.desktopDev.update.check();
    $('#update-status').textContent = describeUpdate(state);
  };

  $('#btn-clear-data').onclick = async () => {
    if (!confirm('Isso apaga sessão, servidores em cache e preferências salvas neste app. Continuar?')) return;
    await window.desktopDev.clearLocalData();
    toastNote('#btn-clear-data', 'Dados locais limpos.');
  };

  $('#btn-change-pw').onclick = async () => {
    const current = $('#pw-current').value;
    const next = $('#pw-new').value;
    const res = await window.desktopDev.changePassword(current, next);
    $('#pw-msg').textContent = res.ok ? 'Senha trocada.' : res.error;
    $('#pw-msg').className = res.ok ? 'dev-ok' : 'dev-error';
    if (res.ok) { $('#pw-current').value = ''; $('#pw-new').value = ''; }
  };
}

function describeUpdate(state) {
  if (!state) return '—';
  const map = {
    idle: 'Ainda não verificado', checking: 'Verificando…', current: 'Já está atualizado',
    available: `Nova versão: ${state.info ? state.info.version : '?'}`, downloading: 'Baixando…',
    ready: 'Baixado, pronto pra instalar', error: `Erro: ${state.error || ''}`, blocked: 'Indisponível (dev/portável)',
  };
  return map[state.status] || state.status;
}

function toastNote(afterSel, text) {
  const btn = $(afterSel);
  const prev = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = prev; }, 2200);
}

document.addEventListener('DOMContentLoaded', boot);
