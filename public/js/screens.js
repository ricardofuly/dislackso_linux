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
  const wrap = el('div', 'range-wrap');
  const out = el('div', 'range-value');
  const input = el('input');
  input.type = 'range';
  Object.assign(input, { min, max, step, value });
  const paint = () => { out.textContent = format ? format(Number(input.value)) : input.value; };
  input.oninput = () => { paint(); onInput(Number(input.value)); };
  paint();
  wrap.append(out, input);
  return wrap;
}

/** Botão com ícone à esquerda do texto. */
function iconButton(name, label, className = 'btn btn-soft') {
  const b = el('button', className);
  b.innerHTML = `<span class="i">${icon(name, 17)}</span><span>${esc(label)}</span>`;
  return b;
}

/* ================================================== teste de microfone == */

const MicTest = {
  ctx: null, raw: null, rnnoiseNode: null, raf: 0, bar: null, gain: null, listenGain: null,
  listen: false,

  async start(barEl, listen = false) {
    this.stop();
    this.bar = barEl;
    this.listen = !!listen;
    try {
      const s = Settings.values;
      this.raw = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: s.echoCancellation,
          noiseSuppression: (s.rnnoise !== false) ? false : s.noiseSuppression,
          autoGainControl: s.autoGainControl,
          ...(s.micId ? { deviceId: { exact: s.micId } } : {}),
        },
      });
    } catch (err) {
      toast('Não consegui abrir o microfone: ' + err.message);
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    try { this.ctx = new Ctx({ sampleRate: 48000 }); } catch { this.ctx = new Ctx(); }

    if (Settings.get('speakerId') && 'setSinkId' in this.ctx && typeof this.ctx.setSinkId === 'function') {
      this.ctx.setSinkId(Settings.get('speakerId')).catch(() => {});
    }

    const src = this.ctx.createMediaStreamSource(this.raw);
    const gain = this.ctx.createGain();
    gain.gain.value = Settings.get('micGain');
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;

    let rnnoiseNode = null;
    if (Settings.get('rnnoise') !== false && typeof RNNoise !== 'undefined') {
      rnnoiseNode = await RNNoise.createNode(this.ctx);
    }

    if (rnnoiseNode) {
      src.connect(rnnoiseNode);
      rnnoiseNode.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(analyser);

    // Retorno de áudio para escutar o próprio microfone
    const listenGain = this.ctx.createGain();
    listenGain.gain.value = this.listen ? 1 : 0;
    gain.connect(listenGain);
    listenGain.connect(this.ctx.destination);

    const buf = new Uint8Array(analyser.frequencyBinCount);
    this.gain = gain;
    this.listenGain = listenGain;
    this.rnnoiseNode = rnnoiseNode;

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

  setListen(enabled) {
    this.listen = !!enabled;
    if (this.listenGain && this.ctx) {
      this.listenGain.gain.setValueAtTime(this.listen ? 1 : 0, this.ctx.currentTime);
    }
  },

  setGain(v) { if (this.gain) this.gain.gain.value = v; },

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.rnnoiseNode) {
      try { this.rnnoiseNode.port.postMessage({ destroy: true }); } catch {}
      try { this.rnnoiseNode.disconnect(); } catch {}
    }
    if (this.listenGain) {
      try { this.listenGain.disconnect(); } catch {}
    }
    if (this.raw) for (const t of this.raw.getTracks()) t.stop();
    if (this.ctx) { try { this.ctx.close(); } catch {} }
    this.ctx = null; this.raw = null; this.gain = null; this.listenGain = null; this.rnnoiseNode = null;
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
      ['Usuário', [['conta', 'Minha conta', 'user'], ['perfil', 'Perfil', 'image']]],
      ['Aplicativo', [['voz', 'Voz e vídeo', 'headphones'],
                      ['transmissao', 'Transmissão', 'screenShare'],
                      ['anotacoes', 'Anotações', 'pen']]],
      ['Aparência', [['tema', 'Tema e cores', 'palette'], ['animacoes', 'Animações', 'sparkles']]],
      ['Sistema', isDesktop()
        ? [['app', 'Aplicativo', 'monitor'],
           ['atualizacoes', 'Atualizações', 'refresh'],
           ['sobre', 'Sobre', 'info']]
        : [['sobre', 'Sobre', 'info']]],
    ];
    for (const [label, items] of groups) {
      nav.appendChild(el('div', 'grp', esc(label)));
      for (const [id, name, ico] of items) {
        const b = el('button', this.section === id ? 'on' : '');
        b.title = name;   // no modo estreito só sobra o ícone
        b.innerHTML = `<span class="i">${icon(ico, 17)}</span><span>${esc(name)}</span>`;
        b.onclick = () => { this.section = id; MicTest.stop(); this.render(); };
        nav.appendChild(b);
      }
    }

    const body = el('div', 'set-body');
    const inner = el('div', 'set-inner');
    body.appendChild(inner);

    const close = el('button', 'set-close', icon('x', 18));
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
      <div class="profile-banner" style="${me.banner ? `background-image:url('${assetUrl(esc(me.banner))}')` : `background:${esc(me.accent || me.color)}`}"></div>
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

    const sair = iconButton('logOut', 'Sair da conta', 'btn btn-ghost');
    sair.onclick = () => confirmModal({
      title: 'Sair da conta',
      body: `Você precisará entrar de novo com nickname <b>${esc(me.username || me.name)}</b> e senha.`,
      okText: 'Sair', danger: true,
    }).then((ok) => { if (ok) logout(); });
    box.appendChild(row({ title: 'Sessão', desc: 'Sai desta conta neste app.', control: sair }));
  },

  /* --------------------------------------------------------- perfil --- */

  section_perfil(box) {
    const me = App.me();
    box.appendChild(el('h2', null, 'Perfil'));
    if (!me) return;

    /**
     * Monta o bloco de envio de imagem (avatar ou banner). Os dois são o
     * mesmo fluxo: prévia, escolher arquivo, enviar, remover.
     */
    const uploadBlock = ({ kind, current, maxMB, label, preview }) => {
      const wrap = el('div', kind === 'avatar' ? 'upload-row' : '');
      const prev = el('div', 'upload-preview' + (kind === 'banner' ? ' banner' : ''));
      if (current) prev.style.backgroundImage = `url('${assetUrl(current)}')`;
      else if (preview.bg) {
        prev.style.background = preview.bg;
        prev.textContent = preview.text;
      }

      const actions = el('div', 'upload-actions');
      if (kind === 'banner') actions.style.marginTop = '10px';

      const send = iconButton('upload', label, 'btn btn-primary');
      send.onclick = async () => {
        const dataUrl = await pickImage({ maxBytes: maxMB * 1024 * 1024 });
        if (!dataUrl) return;
        send.disabled = true;
        send.innerHTML = '<span class="spinner"></span><span>Enviando…</span>';
        try {
          const url = await uploadImage(dataUrl, kind, me.id);
          await App.updateProfile({ [kind]: url });
          this.render();
        } catch (err) {
          toast('Falha ao enviar: ' + err.message);
          send.disabled = false;
          send.innerHTML = `<span class="i">${icon('upload', 17)}</span><span>${esc(label)}</span>`;
        }
      };
      actions.appendChild(send);

      if (current) {
        const rm = iconButton('trash', 'Remover', 'btn btn-ghost');
        rm.onclick = async () => { await App.updateProfile({ [kind]: '' }); this.render(); };
        actions.appendChild(rm);
      }
      wrap.append(prev, actions);
      return wrap;
    };

    box.appendChild(row({
      title: 'Foto de perfil',
      desc: 'PNG, JPG, WEBP ou GIF animado. Até 12 MB.',
      stack: true,
      control: uploadBlock({
        kind: 'avatar', current: me.avatar, maxMB: 12, label: 'Enviar imagem',
        preview: { bg: me.color, text: initials(me.name) },
      }),
    }));

    box.appendChild(row({
      title: 'Banner',
      desc: 'Aparece atrás da sua foto. Até 12 MB.',
      stack: true,
      control: uploadBlock({
        kind: 'banner', current: me.banner, maxMB: 12, label: 'Enviar banner',
        preview: { bg: me.accent || me.color, text: 'sem banner' },
      }),
    }));

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

    /* medidor + volume + retorno */
    const testWrap = el('div');
    const testRow = el('div');
    testRow.style.display = 'flex';
    testRow.style.alignItems = 'center';
    testRow.style.gap = '12px';
    testRow.style.flexWrap = 'wrap';

    const meter = el('div', 'meter', '<i></i>');
    const bar = meter.querySelector('i');
    const testBtn = iconButton('mic', 'Testar microfone');
    let testing = false;
    let listen = false;

    const setLabel = (ico, txt) => {
      testBtn.innerHTML = `<span class="i">${icon(ico, 17)}</span><span>${esc(txt)}</span>`;
    };

    const listenLabel = el('label');
    listenLabel.style.display = 'inline-flex';
    listenLabel.style.alignItems = 'center';
    listenLabel.style.gap = '6px';
    listenLabel.style.cursor = 'pointer';
    listenLabel.style.fontSize = '13px';
    listenLabel.style.userSelect = 'none';
    listenLabel.innerHTML = '<input type="checkbox" style="cursor: pointer;"><span>Ouvir meu microfone (retorno)</span>';

    const listenInput = listenLabel.querySelector('input');
    listenInput.onchange = () => {
      listen = listenInput.checked;
      MicTest.setListen(listen);
    };

    testBtn.onclick = async () => {
      if (testing) {
        MicTest.stop();
        testing = false;
        setLabel('mic', 'Testar microfone');
        return;
      }
      testing = true;
      setLabel('micOff', 'Parar teste');
      await MicTest.start(bar, listen);
      await this.loadDevices();     // agora os nomes aparecem
    };

    testRow.append(testBtn, listenLabel);
    testWrap.append(testRow, meter);
    box.appendChild(row({
      title: 'Nível de entrada',
      desc: 'Fale e veja a barra mexer. Marque a opção para ouvir sua própria voz e conferir a supressão de ruído.',
      control: testWrap,
      stack: true,
    }));

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
      ['rnnoise', 'Supressão de ruído RNNoise (IA)', 'Reduz ruídos de fundo (teclado, cliques, ventilador) com rede neural em tempo real.'],
      ['echoCancellation', 'Cancelamento de eco', 'Evita que o som da caixa volte pelo microfone.'],
      ['noiseSuppression', 'Redução de ruído padrão', 'Filtro de ruído simples do navegador/sistema.'],
      ['autoGainControl', 'Volume automático', 'O navegador equaliza o volume da sua voz.'],
    ]) {
      box.appendChild(row({
        title, desc,
        control: switchControl(Settings.get(key) !== false, (v) => {
          Settings.set(key, v);
          Voice.setMicDevice();
          toast('Aplicado ao microfone.');
        }),
      }));
    }

    box.appendChild(row({
      title: 'Sons de feedback',
      desc: 'Um toque curto ao entrar/sair de sala e iniciar/parar uma transmissão.',
      control: switchControl(Settings.get('feedbackSounds') !== false, (v) => Settings.set('feedbackSounds', v)),
    }));
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

    box.appendChild(row({
      title: 'Abaixar a call ao compartilhar áudio',
      desc: 'Enquanto você transmite com áudio do sistema, abaixa (não desliga) a voz de quem está '
          + 'na chamada — reduz o quanto ela vaza na sua transmissão. O Windows não separa por '
          + 'aplicativo, então não dá pra eliminar 100%; pra isso, configure uma saída de áudio '
          + 'separada pra voz (veja DEPLOY.md).',
      control: switchControl(Settings.get('duckVoiceOnShare'), (v) => { Settings.set('duckVoiceOnShare', v); refreshAllPeerVolumes(); }),
    }));

    const note = el('p', 'set-note',
      'A transmissão é ponto a ponto: em 1080p60 para 3 amigos você envia cerca de 24 Mbps no total. '
      + 'Se a rede não aguentar, o app baixa a qualidade sozinho depois de alguns segundos — dá pra '
      + 'escolher de novo aqui a qualquer momento.');
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
      const escolhido = Settings.get('theme') === t.id;
      card.innerHTML = `<div class="prev">${t.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
                        <div class="nm">
                          <span class="i">${escolhido ? icon('check', 15) : ''}</span>
                          <span>${esc(t.name)}</span>
                        </div>`;
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
    custom.title = 'Cor personalizada';
    custom.value = Settings.get('accent');
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

    const reset = iconButton('refresh', 'Restaurar aparência padrão');
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
      `Servidor : ${window.ENV && window.ENV.SERVER_URL ? window.ENV.SERVER_URL : 'endereço padrão'}`,
      `Dados em : ${info.dataDir}`,
    ].join('\n');
    box.appendChild(row({ title: 'Servidor', desc: 'Situação atual desta instalação.', control: status, stack: true }));

    const reload = iconButton('refresh', 'Recarregar o app');
    reload.onclick = () => window.desktop.goHome();
    box.appendChild(row({ title: 'Recarregar', desc: 'Recarrega a interface — útil depois de trocar o servidor no painel de desenvolvedor.', control: reload }));
  },

  /* ------------------------------------------------------ atualizações - */

  async section_atualizacoes(box) {
    box.appendChild(el('h2', null, 'Atualizações'));
    if (!isDesktop()) return;

    const s = await window.desktop.update.state();

    const rotulos = {
      idle: 'Nunca verificado nesta sessão',
      checking: 'Procurando…',
      available: `Versão ${s.info && s.info.version} disponível`,
      downloading: 'Baixando…',
      ready: `Versão ${s.info && s.info.version} pronta para instalar`,
      current: 'Você está na versão mais recente',
      error: s.error || 'Falha ao verificar',
      blocked: 'Indisponível nesta instalação',
    };

    const situacao = el('div');
    situacao.style.cssText = 'font-size:14px;color:var(--text)';
    situacao.textContent = s.can ? (rotulos[s.status] || rotulos.idle)
      : (s.reason === 'portable'
          ? 'Versão portátil — atualize baixando a nova pasta.'
          : 'Rodando a partir do código-fonte.');
    box.appendChild(row({
      title: `Versão instalada: ${s.current}`,
      desc: 'De onde vêm as atualizações: releases do repositório no GitHub.',
      control: situacao, stack: true,
    }));

    const abrir = iconButton('refresh', s.can ? 'Procurar atualizações' : 'Abrir tela de atualização', 'btn btn-primary');
    abrir.onclick = () => { Updater.open(); if (s.can) Updater.check(); };
    box.appendChild(row({
      title: 'Verificar agora',
      desc: 'Abre a tela de atualização e consulta o GitHub.',
      control: abrir,
    }));

    box.appendChild(row({
      title: 'Procurar ao abrir o app',
      desc: 'Consulta o GitHub alguns segundos depois de iniciar. Nada é baixado sem você mandar.',
      control: switchControl(Settings.get('autoUpdate') !== false, (v) => Settings.set('autoUpdate', v)),
    }));

    const releases = iconButton('link', 'Ver todas as versões');
    releases.onclick = () => window.desktop.openExternal('https://github.com/spikeleez/dislackso/releases');
    box.appendChild(row({
      title: 'Histórico',
      desc: 'A lista completa de versões e o que mudou em cada uma.',
      control: releases,
    }));

    box.appendChild(el('p', 'set-note',
      'A atualização baixa só os pedaços que mudaram desde a sua versão, então costuma ser '
      + 'bem menor que o instalador inteiro. Para concluir, o app reinicia — ele pergunta antes '
      + 'e reabre sozinho.'));
  },

  /* ------------------------------------------------------------ sobre -- */

  async section_sobre(box) {
    box.appendChild(el('h2', null, 'Sobre'));

    const lines = [
      'DiSlackso — servidores privados, tela compartilhada e anotação ao vivo.',
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

    const reset = iconButton('refresh', 'Restaurar todas as configurações', 'btn btn-danger');
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
    ? `background-image:url('${assetUrl(esc(user.banner))}')`
    : `background:${esc(user.accent || user.color)}`;

  // O <h2> fica vazio de propósito: o CSS esconde `h2:empty`, então o banner
  // encosta no topo do cartão sem precisar mexer no estilo por JS.
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
    let wantAudio = Settings.get('shareSystemAudio') !== false;
    let settled = false;

    const done = (id) => { if (!settled) { settled = true; resolve(id ? { id, audio: wantAudio } : null); } };

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

      // Áudio do sistema (loopback) só é possível ao compartilhar uma tela
      // inteira — não existe forma de isolar o som de uma janela só.
      const audioRow = filter === 'screen' ? `
        <label class="picker-audio">
          <input type="checkbox" id="picker-audio-toggle" ${wantAudio ? 'checked' : ''}>
          <span>Compartilhar áudio do sistema</span>
        </label>
        <p class="set-note">Inclui tudo que sai pelos seus alto-falantes agora, inclusive a voz de quem
          estiver na chamada — não dá pra separar só o som do desktop.</p>`
        : '<p class="set-note">Janelas específicas não têm áudio do sistema — só o vídeo.</p>';

      $('#modal-body').innerHTML = `
        <div class="picker-tabs">
          <button data-tab="screen" class="${filter === 'screen' ? 'on' : ''}">
            ${icon('monitor', 16)}<span>Telas inteiras</span>
          </button>
          <button data-tab="window" class="${filter === 'window' ? 'on' : ''}">
            ${icon('grid', 16)}<span>Janelas</span>
          </button>
        </div>
        <div class="picker-grid">${grid || '<p>Nada encontrado aqui.</p>'}</div>
        ${audioRow}`;

      $$('#modal-body [data-tab]').forEach((b) => {
        b.onclick = () => { filter = b.dataset.tab; render(); };
      });
      $$('#modal-body .picker-item').forEach((b) => {
        b.onclick = () => { chosen = b.dataset.id; render(); };
        b.ondblclick = () => { chosen = b.dataset.id; done(chosen); closeModal(); };
      });
      const audioToggle = $('#picker-audio-toggle');
      if (audioToggle) audioToggle.onchange = () => {
        wantAudio = audioToggle.checked;
        Settings.set('shareSystemAudio', wantAudio);
      };
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
