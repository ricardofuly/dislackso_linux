/* ==========================================================================
   updater.js — tela de atualização do aplicativo
   --------------------------------------------------------------------------
   Toda a lógica de rede fica no processo principal (electron-updater); aqui
   só desenhamos o estado que ele manda e oferecemos os botões.

   Nada é baixado nem instalado sem o usuário mandar: a tela pergunta antes
   de baixar e pergunta de novo antes de reiniciar.
   ========================================================================== */

'use strict';

const Updater = {
  state: { status: 'idle', can: false, reason: 'dev', current: '—', info: null, progress: null, error: null },
  avisou: false,

  init() {
    if (!isDesktop() || !window.desktop.update) return;
    const btn = $('#gate-update-btn');
    if (btn) { btn.classList.remove('hidden'); btn.onclick = () => this.open(); }

    window.desktop.update.onChange((state) => {
      this.state = state;
      this.paint();
      this.notify();
      this.syncGateButton();
    });

    window.desktop.update.state().then((state) => {
      this.state = state;
      this.paint();
      this.syncGateButton();
    });

    // Procura sozinho pouco depois de abrir, se o usuário deixou ligado.
    if (Settings.get('autoUpdate') !== false) {
      setTimeout(() => {
        if (this.state.can) window.desktop.update.check();
      }, 4000);
    }
  },

  /** Avisa uma vez, discretamente, quando aparece versão nova. */
  notify() {
    if (this.state.status === 'available' && !this.avisou && !this.isOpen()) {
      this.avisou = true;
      toast(`Versão ${this.state.info.version} disponível — abra Configurações › Atualizações.`, 7000);
    }
    if (this.state.status === 'ready' && !this.isOpen()) {
      this.open();   // baixou: aí sim vale trazer a tela para a frente
    }
  },

  isOpen() { return !$('#updater').classList.contains('hidden'); },

  /** Bolinha verde no botão da tela de login, pra dar pra ver que tem atualização sem estar logado. */
  syncGateButton() {
    const btn = $('#gate-update-btn');
    if (!btn) return;
    const show = ['available', 'downloading', 'ready'].includes(this.state.status);
    let dot = btn.querySelector('.dot');
    if (show && !dot) btn.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
    if (!show && dot) dot.remove();
  },

  open() {
    $('#updater').classList.remove('hidden');
    this.paint();
  },

  close() { $('#updater').classList.add('hidden'); },

  check() {
    if (!isDesktop()) return;
    window.desktop.update.check();
  },

  /* ------------------------------------------------------- desenho ---- */

  paint() {
    const root = $('#updater');
    if (!root || root.classList.contains('hidden')) return;

    const s = this.state;
    const v = s.info && s.info.version;
    let ico = 'refresh';
    let titulo = '';
    let sub = '';
    let girando = false;
    const acoes = [];
    let barra = null;
    let notas = null;

    if (!s.can) {
      ico = 'info';
      if (s.reason === 'portable') {
        titulo = 'Versão portátil';
        sub = 'A atualização automática só funciona na versão instalada. Baixe a nova versão '
            + 'na página de releases e substitua a pasta.';
      } else {
        titulo = 'Modo de desenvolvimento';
        sub = 'Rodando a partir do código-fonte — não há o que atualizar. '
            + 'A atualização automática vale para o app instalado.';
      }
      acoes.push({ label: 'Abrir página de releases', icon: 'link', primary: true, onClick: () => {
        window.desktop.openExternal('https://github.com/spikeleez/dislackso/releases');
      } });
      acoes.push({ label: 'Fechar', icon: 'x', onClick: () => this.close() });
    } else {
      switch (s.status) {
        case 'checking':
          ico = 'refresh'; girando = true;
          titulo = 'Procurando atualizações…';
          sub = `Você está na versão ${s.current}.`;
          break;

        case 'available':
          ico = 'upload';
          titulo = `Versão ${v} disponível`;
          sub = `Você está na ${s.current}. O download aproveita o que já está instalado, `
              + 'então costuma ser bem menor que o instalador inteiro.';
          notas = s.info.notes;
          acoes.push({ label: 'Baixar agora', icon: 'upload', primary: true, onClick: () => {
            window.desktop.update.download();
          } });
          acoes.push({ label: 'Agora não', icon: 'x', onClick: () => this.close() });
          break;

        case 'downloading': {
          const p = s.progress || { percent: 0, transferred: 0, total: 0, speed: 0 };
          ico = 'upload';
          titulo = `Baixando a versão ${v || ''}`.trim();
          sub = p.total
            ? `${fmtBytes(p.transferred)} de ${fmtBytes(p.total)} · ${fmtBytes(p.speed)}/s`
            : 'Preparando o download…';
          barra = p.percent;
          break;
        }

        case 'ready':
          ico = 'check';
          titulo = 'Pronto para instalar';
          sub = `A versão ${v} foi baixada. O app precisa reiniciar para concluir — `
              + 'ele abre sozinho depois.';
          acoes.push({ label: 'Reiniciar e instalar', icon: 'refresh', primary: true, onClick: async () => {
            const ok = await confirmModal({
              title: 'Reiniciar agora?',
              body: 'O DiSlackso vai fechar, instalar a atualização e abrir de novo. '
                  + 'Se você estiver numa sala, vai sair dela.',
              okText: 'Reiniciar',
            });
            if (ok) window.desktop.update.install();
          } });
          acoes.push({ label: 'Instalar depois', icon: 'x', onClick: () => this.close() });
          break;

        case 'current':
          ico = 'check';
          titulo = 'Tudo em dia';
          sub = `A versão ${s.current} é a mais recente.`;
          acoes.push({ label: 'Fechar', icon: 'x', primary: true, onClick: () => this.close() });
          break;

        case 'error':
          ico = 'info';
          titulo = 'Não deu para verificar';
          sub = s.error || 'Erro desconhecido.';
          acoes.push({ label: 'Tentar de novo', icon: 'refresh', primary: true, onClick: () => this.check() });
          acoes.push({ label: 'Fechar', icon: 'x', onClick: () => this.close() });
          break;

        default:
          ico = 'refresh';
          titulo = 'Atualizações';
          sub = `Você está na versão ${s.current}.`;
          acoes.push({ label: 'Procurar atualizações', icon: 'refresh', primary: true, onClick: () => this.check() });
          acoes.push({ label: 'Fechar', icon: 'x', onClick: () => this.close() });
      }
    }

    root.innerHTML = `
      <div class="upd-card">
        <div class="upd-icon${girando ? ' spin' : ''}">${icon(ico, 30)}</div>
        <h2>${esc(titulo)}</h2>
        <p class="upd-sub">${esc(sub)}</p>
        ${barra !== null ? `
          <div class="upd-bar"><i style="width:${barra.toFixed(1)}%"></i></div>
          <div class="upd-pct">${barra.toFixed(0)}%</div>` : ''}
        ${notas ? `<div class="upd-notes">${esc(notas)}</div>` : ''}
        <div class="upd-actions"></div>
      </div>`;

    const box = root.querySelector('.upd-actions');
    for (const a of acoes) {
      const b = el('button', 'btn ' + (a.primary ? 'btn-primary' : 'btn-soft'));
      b.innerHTML = `<span class="i">${icon(a.icon, 17)}</span><span>${esc(a.label)}</span>`;
      b.onclick = a.onClick;
      box.appendChild(b);
    }

    // Durante o download não há saída: evita fechar no meio por engano.
    if (s.status !== 'downloading') {
      root.onclick = (e) => { if (e.target === root) this.close(); };
    } else {
      root.onclick = null;
    }
  },
};

/* ------------------------------------------------------------ formato -- */

function fmtBytes(n) {
  if (!n || n < 1024) return `${Math.round(n || 0)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

window.Updater = Updater;
window.fmtBytes = fmtBytes;
