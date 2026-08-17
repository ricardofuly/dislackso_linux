/* ==========================================================================
   screens.js — tela de configurações, perfil e seletor de telas
   ========================================================================== */

'use strict';

/* ------------------------------------------------ blocos reutilizáveis -- */

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

/** Uma linha de configuração: título + descrição à esquerda, controle à direita. */
function row({ title, desc, control, stack = false }) {
  const node = el('div', 'set-row' + (stack ? ' stack' : ''));
  const info = el('div', 'info', `<b>${esc(title)}</b>${desc ? `<span>${desc}</span>` : ''}`);
  const ctrl = el('div', 'ctrl');
  if (control) ctrl.appendChild(control);
  node.append(info, ctrl);
  return node;
}

function switchControl(checked, onChange) {
  const wrap = el('label', 'switch');
  wrap.innerHTML = '<input type="checkbox"><span class="track"></span><span class="knob"></span>';
  const input = wrap.querySelector('input');
  input.checked = !!checked;
  input.onchange = () => onChange(input.checked);
  return wrap;
}

function selectControl(options, value, onChange) {
  const sel = el('select');
  for (const opt of options) {
    const o = el('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (String(opt.value) === String(value)) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => onChange(sel.value);
  return sel;
}

function rangeControl({ min, max, step, value, format, onInput }) {
  const wrap = el('div');
  const out = el('div', null, '');
  out.style.cssText = 'font-size:12.5px;color:var(--dim);margin-bottom:6px;text-align:right';
  const input = el('input');
  input.type = 'range';
  Object.assign(input, { min, max, step, value });
  const paint = () => { out.textContent = format ? format(Number(input.value)) : input.value; };
  input.oninput = () => { paint(); onInput(Number(input.value)); };
  paint();
  wrap.append(out, input);
  return wrap;
}

/* ================================================== teste de microfone == */

const MicTest = {
  ctx: null, raw: null, raf: 0, bar: null,

  async start(barEl) {
    this.stop();
    this.bar = barEl;
    try {
      const s = Settings.values;
      this.raw = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: s.echoCancellation,
          noiseSuppression: s.noiseSuppression,
          autoGainControl: s.autoGainControl,
          ...(s.micId ? { deviceId: { exact: s.micId } } : {}),
        },
      });
    } catch (err) {
      toast('Não consegui abrir o microfone: ' + err.message);
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaStreamSource(this.raw);
    const gain = this.ctx.createGain();
    gain.gain.value = Settings.get('micGain');
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(gain); gain.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    this.gain = gain;

    const tick = () => {
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (const v of buf) sum += v;
      const pct = clamp((sum / buf.length / 140) * 100, 0, 100);
      if (this.bar) this.bar.style.width = pct + '%';
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  },

  setGain(v) { if (this.gain) this.gain.gain.value = v; },

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.raw) for (const t of this.raw.getTracks()) t.stop();
    if (this.ctx) { try { this.ctx.close(); } catch {} }
    this.ctx = null; this.raw = null; this.gain = null;
    if (this.bar) this.bar.style.width = '0%';
  },
};

/* ====================================================== configurações === */

const SettingsUI = {
  section: 'conta',
  devices: { inputs: [], outputs: [] },

  async open(section) {
    this.section = section || this.section;
    await this.loadDevices();
    $('#settings').classList.remove('hidden');
    this.render();
  },

  close() {
    MicTest.stop();
    $('#settings').classList.add('hidden');
  },

  isOpen() { return !$('#settings').classList.contains('hidden'); },

  async loadDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      this.devices.inputs = list.filter((d) => d.kind === 'audioinput');
      this.devices.outputs = list.filter((d) => d.kind === 'audiooutput');
    } catch {
      this.devices = { inputs: [], outputs: [] };
    }
  },

  render() {
    const root = $('#settings');
    root.innerHTML = '';

    const nav = el('nav', 'set-nav');
    const groups = [
      ['Usuário', [['conta', 'Minha conta'], ['perfil', 'Perfil']]],
      ['Aplicativo', [['voz', 'Voz e vídeo'], ['transmissao', 'Transmissão'], ['anotacoes', 'Anotações']]],
      ['Aparência', [['tema', 'Tema e cores'], ['animacoes', 'Animações']]],
      ['Sistema', isDesktop() ? [['app', 'Aplicativo'], ['sobre', 'Sobre']] : [['sobre', 'Sobre']]],
    ];
    for (const [label, items] of groups) {
      nav.appendChild(el('div', 'grp', esc(label)));
      for (const [id, name] of items) {
        const b = el('button', this.section === id ? 'on' : '', esc(name));
        b.onclick = () => { this.section = id; MicTest.stop(); this.render(); };
        nav.appendChild(b);
      }
    }

    const body = el('div', 'set-body');
    const inner = el('div', 'set-inner');
    body.appendChild(inner);

    const close = el('button', 'set-close', '&#10005;');
    close.title = 'Fechar (Esc)';
    close.onclick = () => this.close();

    root.append(nav, body, close);

    const build = this['section_' + this.section];
    if (build) build.call(this, inner);
  },

  /* ----------------------------------------------------- minha conta -- */

  section_conta(box) {
    const me = App.me();
    box.appendChild(el('h2', null, 'Minha conta'));
    if (!me) { box.appendChild(el('p', 'set-note', 'Conectando…')); return; }

    const card = el('div', 'profile-card');
    card.style.marginBottom = '26px';
    card.innerHTML = `
      <div class="profile-banner" style="${me.banner ? `background-image:url('${esc(me.banner)}')` : `background:${esc(me.accent || me.color)}`}"></div>
      <div class="profile-head">
        ${avatarHTML(me, 'xl')}
        <div class="profile-name">${esc(me.name)}</div>
        ${me.pronouns ? `<div class="profile-pronouns">${esc(me.pronouns)}</div>` : ''}
        ${me.bio ? `<div class="profile-bio">${esc(me.bio)}</div>` : ''}
      </div>`;
    box.appendChild(card);

    const nameInput = el('input');
    nameInput.type = 'text';
    nameInput.maxLength = 32;
    nameInput.value = me.name;
    nameInput.onchange = () => App.updateProfile({ name: nameInput.value.trim() || me.name });
    box.appendChild(row({ title: 'Apelido', desc: 'Como seus amigos te veem.', control: nameInput, stack: true }));

    const pron = el('input');
    pron.type = 'text';
    pron.maxLength = 20;
    pron.value = me.pronouns || '';
    pron.placeholder = 'ele/dele, ela/dela, elu/delu…';
    pron.onchange = () => App.updateProfile({ pronouns: pron.value.trim() });
    box.appendChild(row({ title: 'Pronomes', desc: 'Opcional.', control: pron, stack: true }));

    const bio = el('textarea');
    bio.maxLength = 300;
    bio.value = me.bio || '';
    bio.placeholder = 'Fale um pouco sobre você…';
    bio.onchange = () => App.updateProfile({ bio: bio.value });
    box.appendChild(row({ title: 'Sobre mim', desc: 'Até 300 caracteres.', control: bio, stack: true }));
  },

  /* --------------------------------------------------------- perfil --- */

  section_perfil(box) {
    const me = App.me();
    box.appendChild(el('h2', null, 'Perfil'));
    if (!me) return;

    /* avatar */
    const avaWrap = el('div', 'upload-row');
    const avaPrev = el('div', 'upload-preview');
    if (me.avatar) avaPrev.style.backgroundImage = `url('${me.avatar}')`;
    else { avaPrev.style.background = me.color; avaPrev.textContent = initials(me.name); avaPrev.style.color = '#fff'; avaPrev.style.fontSize = '26px'; }

    const avaBtns = el('div');
    const pick = el('button', 'btn btn-primary', 'Enviar imagem');
    pick.onclick = async () => {
      const dataUrl = await pickImage({ maxBytes: 8 * 1024 * 1024 });
      if (!dataUrl) return;
      pick.disabled = true;
      pick.innerHTML = '<span class="spinner"></span> Enviando…';
      try {
        const url = await uploadImage(dataUrl, 'avatar', me.id);
        await App.updateProfile({ avatar: url });
        this.render();
      } catch (err) {
        toast('Falha ao enviar: ' + err.message);
        pick.disabled = false;
        pick.textContent = 'Enviar imagem';
      }
    };
    avaBtns.appendChild(pick);
    if (me.avatar) {
      const rm = el('button', 'btn btn-ghost', 'Remover');
      rm.onclick = async () => { await App.updateProfile({ avatar: '' }); this.render(); };
      avaBtns.appendChild(rm);
    }
    avaWrap.append(avaPrev, avaBtns);
    box.appendChild(row({
      title: 'Foto de perfil',
      desc: 'PNG, JPG, WEBP ou GIF animado. Até 8 MB.',
      control: avaWrap, stack: true,
    }));

    /* banner */
    const banWrap = el('div');
    const banPrev = el('div', 'upload-preview banner');
    if (me.banner) banPrev.style.backgroundImage = `url('${me.banner}')`;
    else { banPrev.style.background = me.accent || me.color; banPrev.textContent = 'sem banner'; }
    const banBtns = el('div');
    banBtns.style.marginTop = '10px';
    const bpick = el('button', 'btn btn-primary', 'Enviar banner');
    bpick.onclick = async () => {
      const dataUrl = await pickImage({ maxBytes: 12 * 1024 * 1024 });
      if (!dataUrl) return;
      bpick.disabled = true;
      bpick.innerHTML = '<span class="spinner"></span> Enviando…';
      try {
        const url = await uploadImage(dataUrl, 'banner', me.id);
        await App.updateProfile({ banner: url });
        this.render();
      } catch (err) {
        toast('Falha ao enviar: ' + err.message);
        bpick.disabled = false;
        bpick.textContent = 'Enviar banner';
      }
    };
    banBtns.appendChild(bpick);
    if (me.banner) {
      const rm = el('button', 'btn btn-ghost', 'Remover');
      rm.onclick = async () => { await App.updateProfile({ banner: '' }); this.render(); };
      banBtns.appendChild(rm);
    }
    banWrap.append(banPrev, banBtns);
    box.appendChild(row({ title: 'Banner', desc: 'Aparece atrás da sua foto. Até 12 MB.', control: banWrap, stack: true }));

    /* cor de destaque do perfil */
    const sw = el('div', 'swatches');
    for (const c of ACCENTS) {
      const b = el('button', 'swatch-btn' + ((me.accent || me.color) === c ? ' on' : ''));
      b.style.background = c;
      b.onclick = async () => { await App.updateProfile({ accent: c }); this.render(); };
      sw.appendChild(b);
    }
    box.appendChild(row({ title: 'Cor do perfil', desc: 'Usada no banner quando você não tem imagem.', control: sw, stack: true }));
  },

  /* ------------------------------------------------------ voz e vídeo - */

  section_voz(box) {
    box.appendChild(el('h2', null, 'Voz e vídeo'));

    const inputs = this.devices.inputs;
    const outputs = this.devices.outputs;
    const noLabels = inputs.length && !inputs[0].label;

    if (noLabels) {
      const warn = el('p', 'set-note',
        'O navegador esconde o nome dos aparelhos até você permitir o microfone uma vez. Clique em "Testar microfone" abaixo.');
      box.appendChild(warn);
    }

    box.appendChild(row({
      title: 'Microfone',
      desc: 'De onde vem a sua voz.',
      control: selectControl(
        [{ value: '', label: 'Padrão do sistema' },
         ...inputs.map((d, i) => ({ value: d.deviceId, label: d.label || `Microfone ${i + 1}` }))],
        Settings.get('micId'),
        (v) => { Settings.set('micId', v); Voice.setMicDevice(); MicTest.stop(); },
      ),
    }));

    const canSink = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
    box.appendChild(row({
      title: 'Saída de áudio',
      desc: canSink ? 'Onde você ouve os outros.' : 'Seu navegador não permite escolher a saída — use o padrão do sistema.',
      control: canSink ? selectControl(
        [{ value: '', label: 'Padrão do sistema' },
         ...outputs.map((d, i) => ({ value: d.deviceId, label: d.label || `Saída ${i + 1}` }))],
        Settings.get('speakerId'),
        (v) => { Settings.set('speakerId', v); App.applySink(); },
      ) : null,
    }));

    /* medidor + volume */
    const testWrap = el('div');
    const meter = el('div', 'meter', '<i></i>');
    const bar = meter.querySelector('i');
    const testBtn = el('button', 'btn btn-soft', 'Testar microfone');
    let testing = false;
    testBtn.onclick = async () => {
      if (testing) { MicTest.stop(); testing = false; testBtn.textContent = 'Testar microfone'; return; }
      testing = true;
      testBtn.textContent = 'Parar teste';
      await MicTest.start(bar);
      await this.loadDevices();     // agora os nomes aparecem
    };
    testWrap.append(testBtn, meter);
    box.appendChild(row({ title: 'Nível de entrada', desc: 'Fale e veja a barra mexer.', control: testWrap, stack: true }));

    box.appendChild(row({
      title: 'Volume de entrada',
      desc: 'Se sua voz sai baixa, aumente aqui.',
      control: rangeControl({
        min: 0, max: 3, step: 0.05, value: Settings.get('micGain'),
        format: (v) => Math.round(v * 100) + '%',
        onInput: (v) => { Settings.set('micGain', v); Voice.setMicGain(v); MicTest.setGain(v); },
      }),
      stack: true,
    }));

    box.appendChild(row({
      title: 'Modo do microfone',
      desc: 'Apertar para falar só funciona com a janela do app em foco.',
      control: selectControl(
        [{ value: 'voz', label: 'Voz aberta' }, { value: 'ptt', label: 'Apertar para falar' }],
        Settings.get('micMode'),
        (v) => { Settings.set('micMode', v); Voice.applyMicEnabled(); this.render(); },
      ),
    }));

    if (Settings.get('micMode') === 'ptt') {
      const keyBtn = el('button', 'btn btn-soft', teclaNome(Settings.get('pttKey')));
      keyBtn.onclick = () => {
        keyBtn.textContent = 'Pressione uma tecla…';
        const grab = (e) => {
          e.preventDefault();
          Settings.set('pttKey', e.code);
          keyBtn.textContent = teclaNome(e.code);
          window.removeEventListener('keydown', grab, true);
        };
        window.addEventListener('keydown', grab, true);
      };
      box.appendChild(row({ title: 'Tecla de falar', desc: 'Clique e aperte a tecla desejada.', control: keyBtn }));
    }

    for (const [key, title, desc] of [
      ['echoCancellation', 'Cancelamento de eco', 'Evita que o som da caixa volte pelo microfone.'],
      ['noiseSuppression', 'Redução de ruído', 'Corta ventilador, teclado e chiado.'],
      ['autoGainControl', 'Volume automático', 'O navegador equaliza o volume da sua voz.'],
    ]) {
      box.appendChild(row({
        title, desc,
        control: switchControl(Settings.get(key), (v) => {
          Settings.set(key, v);
          Voice.setMicDevice();
          toast('Aplicado ao microfone.');
        }),
      }));
    }
  },

  /* ----------------------------------------------------- transmissão -- */

  section_transmissao(box) {
    box.appendChild(el('h2', null, 'Transmissão'));

    box.appendChild(row({
      title: 'Qualidade',
      desc: 'Acima de 1080p60 exige CPU boa e upload sobrando.',
      control: selectControl(
        Object.entries(QUALITY_PRESETS).map(([k, q]) => ({
          value: k, label: `${q.label} — até ${(q.video / 1e6).toFixed(1)} Mbps`,
        })),
        Settings.get('quality'),
        (v) => { Settings.set('quality', v); Voice.setQuality(v); },
      ),
    }));

    box.appendChild(row({
      title: 'Prioridade',
      desc: 'Fluidez borra um pouco em movimento; nitidez mantém o texto legível e derruba FPS.',
      control: selectControl(
        [{ value: 'motion', label: 'Fluidez — jogos e vídeo' },
         { value: 'detail', label: 'Nitidez — código e texto' }],
        Settings.get('contentHint'),
        (v) => { Settings.set('contentHint', v); Voice.setContentHint(v); },
      ),
    }));

    box.appendChild(row({
      title: 'Abrir em destaque',
      desc: 'Quando alguém começa a transmitir, a tela dele ocupa o palco automaticamente.',
      control: switchControl(Settings.get('autoFocus'), (v) => Settings.set('autoFocus', v)),
    }));

    box.appendChild(row({
      title: 'Ver a própria tela',
      desc: 'Mostra uma prévia do que você está transmitindo.',
      control: switchControl(Settings.get('selfPreview'), (v) => { Settings.set('selfPreview', v); App.refresh(); }),
    }));

    const note = el('p', 'set-note',
      'A transmissão é ponto a ponto: em 1080p60 para 3 amigos você envia cerca de 24 Mbps no total. '
      + 'Se a imagem picotar, desça um nível de qualidade.');
    box.appendChild(note);
  },

  /* ------------------------------------------------------- anotações -- */

  section_anotacoes(box) {
    box.appendChild(el('h2', null, 'Anotações'));
    box.appendChild(el('p', 'set-note',
      'Qualquer pessoa na sala pode rabiscar sobre a tela de quem está transmitindo, como no Slack. '
      + 'Os traços aparecem para todos.'));

    box.appendChild(row({
      title: 'Deixar rabiscarem na minha tela',
      desc: 'Se desligar, ninguém consegue desenhar sobre a sua transmissão.',
      control: switchControl(Settings.get('annotAllow'), (v) => { Settings.set('annotAllow', v); Voice.publishState(); }),
    }));

    box.appendChild(row({
      title: 'Sumir depois de',
      desc: 'Tempo até o traço desaparecer sozinho.',
      control: selectControl(
        [{ value: 0, label: 'Nunca — só apagando' },
         { value: 4, label: '4 segundos' },
         { value: 8, label: '8 segundos' },
         { value: 15, label: '15 segundos' },
         { value: 30, label: '30 segundos' }],
        Settings.get('annotFade'),
        (v) => Settings.set('annotFade', Number(v)),
      ),
    }));

    const sw = el('div', 'swatches');
    for (const c of ANNOT_COLORS) {
      const b = el('button', 'swatch-btn' + (Settings.get('annotColor') === c ? ' on' : ''));
      b.style.background = c;
      b.onclick = () => { Settings.set('annotColor', c); Annot.color = c; this.render(); };
      sw.appendChild(b);
    }
    box.appendChild(row({ title: 'Cor padrão', desc: 'Com que cor sua caneta começa.', control: sw, stack: true }));

    box.appendChild(row({
      title: 'Espessura',
      desc: 'Grossura do traço.',
      control: rangeControl({
        min: 2, max: 12, step: 1, value: Settings.get('annotSize'),
        format: (v) => v + ' px',
        onInput: (v) => { Settings.set('annotSize', v); Annot.size = v; },
      }),
      stack: true,
    }));
  },

  /* ------------------------------------------------------ tema/cores -- */

  section_tema(box) {
    box.appendChild(el('h2', null, 'Tema e cores'));

    const cards = el('div', 'theme-cards');
    for (const t of THEMES) {
      const card = el('button', 'theme-card' + (Settings.get('theme') === t.id ? ' on' : ''));
      card.innerHTML = `<div class="prev">${t.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
                        <div class="nm">${esc(t.name)}</div>`;
      card.onclick = () => { Settings.set('theme', t.id); this.render(); };
      cards.appendChild(card);
    }
    box.appendChild(row({ title: 'Tema', desc: 'A base de cores do app.', control: cards, stack: true }));

    const sw = el('div', 'swatches');
    for (const c of ACCENTS) {
      const b = el('button', 'swatch-btn' + (Settings.get('accent') === c ? ' on' : ''));
      b.style.background = c;
      b.onclick = () => { Settings.set('accent', c); this.render(); };
      sw.appendChild(b);
    }
    const custom = el('input');
    custom.type = 'color';
    custom.value = Settings.get('accent');
    custom.style.cssText = 'width:34px;height:34px;padding:0;border:0;background:none;cursor:pointer';
    custom.oninput = () => Settings.set('accent', custom.value);
    sw.appendChild(custom);
    box.appendChild(row({ title: 'Cor de destaque', desc: 'Botões, seleção e realces.', control: sw, stack: true }));

    box.appendChild(row({
      title: 'Cantos arredondados',
      desc: 'De quadrado a bem redondo.',
      control: rangeControl({
        min: 0, max: 2, step: 0.1, value: Settings.get('radius'),
        format: (v) => v === 0 ? 'reto' : Math.round(v * 100) + '%',
        onInput: (v) => Settings.set('radius', v),
      }),
      stack: true,
    }));

    box.appendChild(row({
      title: 'Transparência',
      desc: 'Quanto as superfícies de vidro deixam passar. Precisa de aceleração de hardware.',
      control: rangeControl({
        min: 0.35, max: 1, step: 0.01, value: Settings.get('glass'),
        format: (v) => Math.round((1 - v) * 100) + '% transparente',
        onInput: (v) => Settings.set('glass', v),
      }),
      stack: true,
    }));

    const reset = el('button', 'btn btn-soft', 'Restaurar aparência padrão');
    reset.onclick = () => {
      Settings.patch({ theme: 'escuro', accent: '#5865f2', radius: 1, glass: 0.74 });
      this.render();
    };
    box.appendChild(row({ title: 'Recomeçar', desc: 'Volta tema, cor e cantos ao original.', control: reset }));
  },

  /* ------------------------------------------------------- animações -- */

  section_animacoes(box) {
    box.appendChild(el('h2', null, 'Animações'));

    box.appendChild(row({
      title: 'Animações',
      desc: 'Desligado, tudo continua funcionando — só aparece na hora, sem transição.',
      control: switchControl(Settings.get('motion') === 'on', (v) => {
        Settings.set('motion', v ? 'on' : 'off');
        this.render();
      }),
    }));

    if (Settings.get('motion') === 'on') {
      box.appendChild(row({
        title: 'Velocidade',
        desc: 'Menor é mais rápido e discreto; maior é mais suave.',
        control: rangeControl({
          min: 0.5, max: 1.8, step: 0.1, value: Settings.get('motionSpeed'),
          format: (v) => v < 0.9 ? 'rápida' : v > 1.3 ? 'suave' : 'normal',
          onInput: (v) => Settings.set('motionSpeed', v),
        }),
        stack: true,
      }));
    }

    box.appendChild(row({
      title: 'Aceleração de hardware',
      desc: 'Usa a placa de vídeo para desfoque e transições. Desligue se o app estiver pesado ou piscando.',
      control: switchControl(Settings.get('gpu') === 'on', (v) => {
        Settings.set('gpu', v ? 'on' : 'off');
        if (isDesktop()) {
          toast('Para valer também na janela do app, ajuste na tela inicial e reinicie.');
        }
      }),
    }));

    box.appendChild(el('p', 'set-note',
      'Se o seu sistema estiver configurado para "reduzir movimento", o app respeita isso '
      + 'automaticamente — a menos que você ligue as animações aqui de propósito.'));
  },

  /* ------------------------------------------------------ aplicativo -- */

  async section_app(box) {
    box.appendChild(el('h2', null, 'Aplicativo'));
    if (!isDesktop()) return;

    const info = await window.desktop.info();

    const status = el('div', 'statbox');
    status.textContent = [
      `Hospedando aqui : ${info.hosting ? 'sim' : 'não'}`,
      info.hostInfo ? `Endereço local  : ${info.hostInfo.url}` : null,
      info.hostInfo && info.hostInfo.lan.length ? `Na rede         : ${info.hostInfo.lan.join('\n                  ')}` : null,
      info.tunnelUrl ? `Link público    : ${info.tunnelUrl}` : null,
      `Dados em        : ${info.dataDir}`,
    ].filter(Boolean).join('\n');
    box.appendChild(row({ title: 'Servidor', desc: 'Situação atual desta instalação.', control: status, stack: true }));

    if (info.hosting) {
      const btns = el('div');
      btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      if (!info.tunnelUrl) {
        const t = el('button', 'btn btn-primary', 'Criar link público');
        t.onclick = async () => {
          t.disabled = true;
          t.innerHTML = '<span class="spinner"></span> Abrindo…';
          try {
            const url = await window.desktop.tunnelStart(info.hostInfo.url);
            copyText(url, 'Link público copiado!');
            this.render();
          } catch (err) {
            toast('Falhou: ' + (err.message || err));
            t.disabled = false;
            t.textContent = 'Criar link público';
          }
        };
        btns.appendChild(t);
      } else {
        const c = el('button', 'btn btn-primary', 'Copiar link público');
        c.onclick = () => copyText(info.tunnelUrl, 'Link copiado!');
        btns.appendChild(c);
      }
      box.appendChild(row({ title: 'Link para os amigos', desc: 'Endereço HTTPS que funciona de qualquer lugar.', control: btns, stack: true }));
    }

    const home = el('button', 'btn btn-soft', 'Voltar à tela inicial');
    home.onclick = () => window.desktop.goHome();
    box.appendChild(row({ title: 'Trocar de servidor', desc: 'Encerra a sessão e volta para a escolha de hospedar/conectar.', control: home }));
  },

  /* ------------------------------------------------------------ sobre -- */

  async section_sobre(box) {
    box.appendChild(el('h2', null, 'Sobre'));

    const lines = [
      'Discord2 — servidores privados e compartilhamento de tela.',
      '',
      'A mídia vai direto entre os participantes (WebRTC). O servidor só',
      'apresenta as pessoas e guarda servidores, convites e perfis.',
      '',
    ];
    if (isDesktop()) {
      const info = await window.desktop.info();
      lines.push(`versão ${info.version} · Electron ${info.electron} · Chromium ${info.chrome}`);
    } else {
      lines.push('rodando no navegador');
    }
    const pre = el('div', 'statbox');
    pre.textContent = lines.join('\n');
    box.appendChild(pre);

    const reset = el('button', 'btn btn-danger', 'Restaurar todas as configurações');
    reset.onclick = async () => {
      const ok = await confirmModal({
        title: 'Restaurar configurações',
        body: 'Tema, atalhos, dispositivos e qualidade voltam ao padrão. Seus servidores e perfil não são afetados.',
        okText: 'Restaurar', danger: true,
      });
      if (!ok) return;
      Settings.reset();
      Voice.setQuality(Settings.get('quality'));
      this.render();
      toast('Configurações restauradas.');
    };
    box.appendChild(row({ title: 'Recomeçar', desc: 'Volta tudo desta tela ao padrão de fábrica.', control: reset }));
  },
};

/** Nome legível de um KeyboardEvent.code. */
function teclaNome(code) {
  if (!code) return '—';
  return String(code)
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Space', 'Barra de espaço')
    .replace('ControlLeft', 'Ctrl esq.').replace('ControlRight', 'Ctrl dir.')
    .replace('ShiftLeft', 'Shift esq.').replace('ShiftRight', 'Shift dir.')
    .replace('AltLeft', 'Alt esq.').replace('AltRight', 'Alt dir.');
}

/* ================================================== cartão de perfil ==== */

function showProfile(user) {
  const bannerStyle = user.banner
    ? `background-image:url('${esc(user.banner)}')`
    : `background:${esc(user.accent || user.color)}`;

  openModal({
    title: '',
    body: `
      <div class="profile-banner" style="${bannerStyle};margin:-26px -26px 0;border-radius:0"></div>
      <div style="margin-top:-46px">
        ${avatarHTML(user, 'xl')}
        <div class="profile-name">${esc(user.name)}</div>
        ${user.pronouns ? `<div class="profile-pronouns">${esc(user.pronouns)}</div>` : ''}
        ${user.bio ? `<div class="profile-bio">${esc(user.bio)}</div>` : ''}
        ${user.createdAt ? `<div class="profile-meta">Por aqui desde ${new Date(user.createdAt).toLocaleDateString('pt-BR')}</div>` : ''}
      </div>`,
    showCancel: false,
    okText: 'Fechar',
    onOk: () => {},
  });
  $('#modal-title').style.display = 'none';
  const restore = () => { $('#modal-title').style.display = ''; };
  setTimeout(() => { $('#modal').addEventListener('click', restore, { once: true }); }, 0);
  $('#modal-ok').addEventListener('click', restore, { once: true });
}

/* ============================================== seletor de telas ======== */

/**
 * Só no app desktop: o Electron nos entrega a lista de janelas e telas, e
 * mostramos nosso próprio seletor com miniaturas.
 */
function installScreenPicker() {
  if (!isDesktop()) return;

  window.desktop.onPickScreen((sources) => new Promise((resolve) => {
    let filter = 'screen';
    let chosen = null;
    let settled = false;

    const done = (id) => { if (!settled) { settled = true; resolve(id); } };

    const render = () => {
      const list = sources.filter((s) => s.type === filter);
      const grid = list.map((s) => `
        <button class="picker-item${chosen === s.id ? ' on' : ''}" data-id="${esc(s.id)}">
          <img src="${s.thumbnail}" alt="">
          <div class="cap">
            ${s.icon ? `<img src="${s.icon}" alt="">` : ''}
            <span>${esc(s.name)}</span>
          </div>
        </button>`).join('');

      $('#modal-body').innerHTML = `
        <div class="picker-tabs">
          <button data-tab="screen" class="${filter === 'screen' ? 'on' : ''}">Telas inteiras</button>
          <button data-tab="window" class="${filter === 'window' ? 'on' : ''}">Janelas</button>
        </div>
        <div class="picker-grid">${grid || '<p>Nada encontrado aqui.</p>'}</div>
        <p class="set-note">Escolher uma tela inteira captura também o áudio do sistema (Windows).</p>`;

      $$('#modal-body [data-tab]').forEach((b) => {
        b.onclick = () => { filter = b.dataset.tab; render(); };
      });
      $$('#modal-body .picker-item').forEach((b) => {
        b.onclick = () => { chosen = b.dataset.id; render(); };
        b.ondblclick = () => { chosen = b.dataset.id; done(chosen); closeModal(); };
      });
    };

    openModal({
      title: 'O que você quer compartilhar?',
      body: '',
      okText: 'Compartilhar',
      wide: true,
      onOk: () => {
        if (!chosen) { toast('Escolha uma tela ou janela.'); return false; }
        done(chosen);
      },
      onClose: () => done(null),
    });
    render();
  }));
}

window.SettingsUI = SettingsUI;
window.showProfile = showProfile;
window.installScreenPicker = installScreenPicker;
