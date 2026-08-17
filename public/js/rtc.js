/* ==========================================================================
   rtc.js — motor de mídia
   --------------------------------------------------------------------------
   Malha P2P: cada participante abre uma RTCPeerConnection com cada um dos
   outros. O servidor só apresenta os pares; áudio e vídeo vão direto.

   Cuidados que fazem diferença na qualidade:
     - VP9 preferido (bem melhor que VP8 em texto/UI de tela cheia);
     - degradationPreference = maintain-resolution: sob perda de banda o
       navegador derruba FPS, nunca a nitidez (o contrário do padrão);
     - maxBitrate/maxFramerate explícitos por encoding;
     - contentHint dizendo ao encoder se é texto parado ou jogo em movimento;
     - Opus forçado em estéreo 48 kHz com bitrate alto e sem DTX.

   O microfone passa por um grafo de Web Audio (fonte → ganho → destino) para
   que volume de entrada e medidor de voz funcionem, e para que trocar de
   dispositivo seja um replaceTrack — sem renegociar nada.
   ========================================================================== */

'use strict';

const QUALITY_PRESETS = {
  '720p30':  { label: '720p 30fps',  w: 1280, h: 720,  fps: 30, video: 2_500_000,  audio: 128_000 },
  '1080p30': { label: '1080p 30fps', w: 1920, h: 1080, fps: 30, video: 4_500_000,  audio: 192_000 },
  '1080p60': { label: '1080p 60fps', w: 1920, h: 1080, fps: 60, video: 8_000_000,  audio: 256_000 },
  '1440p60': { label: '1440p 60fps', w: 2560, h: 1440, fps: 60, video: 12_000_000, audio: 256_000 },
  '4k30':    { label: '4K 30fps',    w: 3840, h: 2160, fps: 30, video: 16_000_000, audio: 256_000 },
};

const CODEC_ORDER = ['video/VP9', 'video/H264', 'video/AV1', 'video/VP8'];

/* -------------------------------------------------------- sdp helpers --- */

/** Reescreve os fmtp do Opus para estéreo real e bitrate alto. */
function tuneOpus(sdp, audioBitrate) {
  const wanted = {
    stereo: '1',
    'sprop-stereo': '1',
    maxaveragebitrate: String(audioBitrate),
    maxplaybackrate: '48000',
    useinbandfec: '1',
    usedtx: '0',
  };

  for (const match of [...sdp.matchAll(/a=rtpmap:(\d+) opus\/48000\/2/g)]) {
    const pt = match[1];
    const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
    const existing = sdp.match(fmtpRe);

    if (existing) {
      const params = new Map();
      for (const pair of existing[1].split(';')) {
        const [k, v] = pair.split('=');
        if (k && k.trim()) params.set(k.trim(), v);
      }
      for (const [k, v] of Object.entries(wanted)) params.set(k, v);
      const merged = [...params].map(([k, v]) => (v === undefined ? k : `${k}=${v}`)).join(';');
      sdp = sdp.replace(fmtpRe, `a=fmtp:${pt} ${merged}`);
    } else {
      const line = Object.entries(wanted).map(([k, v]) => `${k}=${v}`).join(';');
      sdp = sdp.replace(match[0], `${match[0]}\r\na=fmtp:${pt} ${line}`);
    }
  }
  return sdp;
}

function preferCodecs(transceiver) {
  if (!transceiver || typeof transceiver.setCodecPreferences !== 'function') return;
  if (!window.RTCRtpReceiver || !RTCRtpReceiver.getCapabilities) return;
  const caps = RTCRtpReceiver.getCapabilities('video');
  if (!caps || !caps.codecs) return;

  const rank = (c) => {
    const i = CODEC_ORDER.indexOf(c.mimeType);
    return i === -1 ? CODEC_ORDER.length : i;
  };
  try {
    transceiver.setCodecPreferences([...caps.codecs].sort((a, b) => rank(a) - rank(b)));
  } catch (err) {
    console.warn('[rtc] setCodecPreferences ignorado:', err.message);
  }
}

async function tuneSender(sender, { bitrate, fps, keepResolution }) {
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    const enc = params.encodings[0];
    enc.maxBitrate = bitrate;
    if (fps) enc.maxFramerate = fps;
    enc.networkPriority = 'high';
    enc.priority = 'high';
    if (keepResolution) params.degradationPreference = 'maintain-resolution';
    await sender.setParameters(params);
  } catch (err) {
    console.warn('[rtc] setParameters falhou:', err.message);
  }
}

/* ---------------------------------------------------------------- peer -- */

class Peer {
  constructor(engine, sid, info) {
    this.engine = engine;
    this.sid = sid;
    this.user = info.user;
    this.state = info.state || { mic: false, screen: false, streams: {} };

    // Ordem estável e oposta nos dois lados: um é educado, o outro não.
    this.polite = engine.sid > sid;
    this.makingOffer = false;
    this.ignoreOffer = false;

    this.streams = new Map();
    this.senders = { mic: null, screenVideo: null, screenAudio: null };

    this.pc = new RTCPeerConnection({
      iceServers: engine.iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    this.pc.onnegotiationneeded = this.onNegotiationNeeded;
    this.pc.onicecandidate = ({ candidate }) => candidate && this.signal({ candidate });
    this.pc.ontrack = this.onTrack;
    this.pc.onconnectionstatechange = () => {
      this.engine.emit('peerchange', this);
      if (this.pc.connectionState === 'failed') {
        console.warn('[rtc] conexão falhou com', this.user.name, '- reiniciando ICE');
        try { this.pc.restartIce(); } catch {}
      }
    };

    this.publishLocalTracks();

    // Se ninguém tem faixa para enviar, nada dispara a negociação. O lado
    // "impaciente" abre a conversa para o handshake acontecer mesmo assim.
    if (!this.polite && this.pc.getSenders().length === 0) {
      this.pc.addTransceiver('audio', { direction: 'recvonly' });
    }
  }

  signal(data) {
    this.engine.socket.emit('rtc:signal', { to: this.sid, data });
  }

  onNegotiationNeeded = async () => {
    try {
      this.makingOffer = true;
      const offer = await this.pc.createOffer();
      offer.sdp = tuneOpus(offer.sdp, this.engine.quality.audio);
      await this.pc.setLocalDescription(offer);
      this.signal({ description: this.pc.localDescription });
    } catch (err) {
      console.error('[rtc] erro ao criar oferta:', err);
    } finally {
      this.makingOffer = false;
    }
  };

  /**
   * Enfileira o tratamento: ofertas e candidatos precisam ser aplicados na
   * ordem em que chegaram, e processSignal é assíncrono.
   */
  handleSignal(data) {
    this.chain = (this.chain || Promise.resolve())
      .then(() => this.processSignal(data))
      .catch((err) => console.error('[rtc] signaling:', err));
    return this.chain;
  }

  async processSignal(data) {
    const pc = this.pc;
    if (pc.signalingState === 'closed') return;
    try {
      if (data.description) {
        const desc = data.description;
        const collision = desc.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');

        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;

        await pc.setRemoteDescription(desc); // rollback implícito se preciso

        if (desc.type === 'offer') {
          const answer = await pc.createAnswer();
          answer.sdp = tuneOpus(answer.sdp, this.engine.quality.audio);
          await pc.setLocalDescription(answer);
          this.signal({ description: pc.localDescription });
        }
        this.retuneSenders();
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!this.ignoreOffer) console.warn('[rtc] candidato recusado:', err.message);
        }
      }
    } catch (err) {
      console.error('[rtc] erro no signaling:', err);
    }
  }

  onTrack = (event) => {
    const stream = event.streams[0];
    if (!stream) return;
    if (!this.streams.has(stream.id)) {
      this.streams.set(stream.id, stream);
      stream.addEventListener('removetrack', () => {
        if (stream.getTracks().length === 0) {
          this.streams.delete(stream.id);
          this.engine.emit('peerchange', this);
        }
      });
    }
    event.track.addEventListener('ended', () => this.engine.emit('peerchange', this));
    event.track.addEventListener('unmute', () => this.engine.emit('peerchange', this));
    this.engine.emit('peerchange', this);
  };

  publishLocalTracks() {
    const { micStream, screenStream } = this.engine.local;

    if (micStream) {
      for (const track of micStream.getAudioTracks()) {
        this.senders.mic = this.pc.addTrack(track, micStream);
      }
    }
    if (screenStream) {
      for (const track of screenStream.getVideoTracks()) {
        this.senders.screenVideo = this.pc.addTrack(track, screenStream);
      }
      for (const track of screenStream.getAudioTracks()) {
        this.senders.screenAudio = this.pc.addTrack(track, screenStream);
      }
    }
    this.retuneSenders();
  }

  retuneSenders() {
    const q = this.engine.quality;

    if (this.senders.screenVideo) {
      const tr = this.pc.getTransceivers().find((t) => t.sender === this.senders.screenVideo);
      preferCodecs(tr);
      tuneSender(this.senders.screenVideo, { bitrate: q.video, fps: q.fps, keepResolution: true });
    }
    if (this.senders.screenAudio) tuneSender(this.senders.screenAudio, { bitrate: q.audio });
    if (this.senders.mic) tuneSender(this.senders.mic, { bitrate: 96_000 });
  }

  addScreen(stream) {
    for (const track of stream.getVideoTracks()) {
      this.senders.screenVideo = this.pc.addTrack(track, stream);
    }
    for (const track of stream.getAudioTracks()) {
      this.senders.screenAudio = this.pc.addTrack(track, stream);
    }
    this.retuneSenders();
  }

  removeScreen() {
    for (const key of ['screenVideo', 'screenAudio']) {
      const sender = this.senders[key];
      if (!sender) continue;
      try { this.pc.removeTrack(sender); } catch (err) { console.warn('[rtc]', err.message); }
      this.senders[key] = null;
    }
  }

  /** Troca a faixa de microfone sem renegociar — usado ao mudar de aparelho. */
  async swapMic(track) {
    if (!this.senders.mic) return;
    try { await this.senders.mic.replaceTrack(track); } catch (err) {
      console.warn('[rtc] replaceTrack falhou:', err.message);
    }
  }

  screenStream() {
    const id = this.state && this.state.streams && this.state.streams.screen;
    if (id && this.streams.has(id)) return this.streams.get(id);
    for (const s of this.streams.values()) if (s.getVideoTracks().length) return s;
    return null;
  }

  micStream() {
    const id = this.state && this.state.streams && this.state.streams.mic;
    if (id && this.streams.has(id)) return this.streams.get(id);
    for (const s of this.streams.values()) {
      if (!s.getVideoTracks().length && s.getAudioTracks().length) return s;
    }
    return null;
  }

  close() {
    try { this.pc.close(); } catch {}
    this.streams.clear();
  }
}

/* -------------------------------------------------------------- engine -- */

class VoiceEngine {
  constructor() {
    this.socket = null;
    this.sid = null;
    this.iceServers = [];
    this.peers = new Map();
    this.pending = new Map();   // sid -> sinais chegados antes do par existir
    this.listeners = new Map();

    this.qualityKey = '1080p60';
    this.quality = QUALITY_PRESETS['1080p60'];
    this.contentHint = 'motion';

    this.local = { micStream: null, screenStream: null };
    this.mic = { raw: null, ctx: null, gain: null, analyser: null, dest: null, buf: null, raf: 0 };

    this.micEnabled = false;   // o que o usuário escolheu
    this.pttHeld = false;      // tecla de falar pressionada
    this.speaking = false;
    this.inRoom = false;
  }

  /* ---- eventos ---- */
  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }
  emit(name, payload) {
    for (const fn of this.listeners.get(name) || []) {
      try { fn(payload); } catch (err) { console.error('[rtc] listener', name, err); }
    }
  }

  configure({ socket, sid, iceServers }) {
    this.socket = socket;
    this.sid = sid;
    this.iceServers = iceServers || [];
  }

  setQuality(key) {
    if (!QUALITY_PRESETS[key]) return;
    this.qualityKey = key;
    this.quality = QUALITY_PRESETS[key];
    for (const peer of this.peers.values()) peer.retuneSenders();

    const track = this.local.screenStream && this.local.screenStream.getVideoTracks()[0];
    if (track) {
      const q = this.quality;
      track.applyConstraints({
        width: { ideal: q.w, max: q.w },
        height: { ideal: q.h, max: q.h },
        frameRate: { ideal: q.fps, max: q.fps },
      }).catch((err) => console.warn('[rtc] applyConstraints:', err.message));
    }
    this.emit('localchange');
  }

  setContentHint(hint) {
    this.contentHint = hint;
    const track = this.local.screenStream && this.local.screenStream.getVideoTracks()[0];
    if (track) track.contentHint = hint;
    this.emit('localchange');
  }

  /* ================================================== microfone ======== */

  /**
   * Abre o microfone e monta o grafo de áudio.
   * Devolve a faixa que sai para os pares (já com ganho aplicado).
   */
  async openMic() {
    const s = Settings.values;
    const constraints = {
      audio: {
        channelCount: 1,
        echoCancellation: s.echoCancellation,
        noiseSuppression: s.noiseSuppression,
        autoGainControl: s.autoGainControl,
        ...(s.micId ? { deviceId: { exact: s.micId } } : {}),
      },
    };

    let raw;
    try {
      raw = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Aparelho escolhido sumiu (desconectado): tenta o padrão do sistema.
      if (s.micId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
        Settings.set('micId', '');
        return this.openMic();
      }
      throw err;
    }

    this.closeMicGraph();
    this.mic.raw = raw;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx({ sampleRate: 48000 });
    const src = ctx.createMediaStreamSource(raw);
    const gain = ctx.createGain();
    gain.gain.value = clamp(Number(s.micGain) || 1, 0, 3);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    const dest = ctx.createMediaStreamDestination();

    src.connect(gain);
    gain.connect(dest);
    gain.connect(analyser);

    Object.assign(this.mic, {
      ctx, src, gain, analyser, dest,
      buf: new Uint8Array(analyser.frequencyBinCount),
    });

    this.local.micStream = dest.stream;
    this.applyMicEnabled();
    this.watchLevel();
    return dest.stream.getAudioTracks()[0];
  }

  closeMicGraph() {
    cancelAnimationFrame(this.mic.raf);
    if (this.mic.raw) for (const t of this.mic.raw.getTracks()) t.stop();
    if (this.mic.ctx) { try { this.mic.ctx.close(); } catch {} }
    this.mic = { raw: null, ctx: null, gain: null, analyser: null, dest: null, buf: null, raf: 0 };
  }

  /** Troca o microfone em uso, sem derrubar as conexões. */
  async setMicDevice() {
    if (!this.inRoom) return;
    try {
      const track = await this.openMic();
      for (const peer of this.peers.values()) await peer.swapMic(track);
      this.publishState();
      this.emit('localchange');
    } catch (err) {
      this.emit('notice', 'Não consegui abrir esse microfone: ' + err.message);
    }
  }

  setMicGain(value) {
    if (this.mic.gain) this.mic.gain.gain.value = clamp(Number(value) || 1, 0, 3);
  }

  watchLevel() {
    const tick = () => {
      if (!this.mic.analyser) return;
      this.mic.analyser.getByteFrequencyData(this.mic.buf);
      let sum = 0;
      for (const v of this.mic.buf) sum += v;
      const avg = sum / this.mic.buf.length;
      this.level = avg / 255;

      const open = this.micOpen();
      const speaking = open && avg > 12;
      if (speaking !== this.speaking) {
        this.speaking = speaking;
        this.publishState();
        this.emit('localchange');
      }
      this.emit('level', this.level);
      this.mic.raf = requestAnimationFrame(tick);
    };
    this.mic.raf = requestAnimationFrame(tick);
  }

  /** O microfone está realmente aberto agora? */
  micOpen() {
    if (!this.local.micStream) return false;
    if (!this.micEnabled) return false;
    return Settings.get('micMode') === 'ptt' ? this.pttHeld : true;
  }

  applyMicEnabled() {
    const open = this.micOpen();
    if (this.local.micStream) {
      for (const t of this.local.micStream.getAudioTracks()) t.enabled = open;
    }
    if (!open && this.speaking) this.speaking = false;
  }

  toggleMic() {
    if (!this.local.micStream) {
      this.emit('notice', 'Nenhum microfone disponível.');
      return false;
    }
    this.micEnabled = !this.micEnabled;
    this.applyMicEnabled();
    this.publishState();
    this.emit('localchange');
    return this.micEnabled;
  }

  setPtt(held) {
    if (this.pttHeld === held) return;
    this.pttHeld = held;
    this.applyMicEnabled();
    this.publishState();
    this.emit('localchange');
  }

  /* ================================================== sala ============== */

  async start() {
    this.inRoom = true;
    if (!this.local.micStream) {
      try {
        await this.openMic();
        this.micEnabled = false;
        this.applyMicEnabled();
      } catch (err) {
        console.warn('[rtc] sem microfone:', err.message);
        this.emit('notice', 'Microfone indisponível — você ainda pode ouvir e compartilhar tela.');
      }
    }
    this.publishState();
  }

  stop() {
    this.inRoom = false;
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.pending.clear();

    this.closeMicGraph();
    if (this.local.screenStream) for (const t of this.local.screenStream.getTracks()) t.stop();
    this.local = { micStream: null, screenStream: null };

    this.micEnabled = false;
    this.speaking = false;
    this.pttHeld = false;
    this.emit('localchange');
    this.emit('peerschange');
  }

  addPeer(info) {
    if (!info || this.peers.has(info.sid) || info.sid === this.sid) return;
    const peer = new Peer(this, info.sid, info);
    this.peers.set(info.sid, peer);

    // Entrega o que chegou antes deste par existir (ver handleSignal).
    const queued = this.pending.get(info.sid);
    if (queued) {
      this.pending.delete(info.sid);
      for (const data of queued) peer.handleSignal(data);
    }

    this.emit('peerschange');
    return peer;
  }

  removePeer(sid) {
    const peer = this.peers.get(sid);
    if (!peer) return;
    peer.close();
    this.peers.delete(sid);
    this.emit('peerschange');
  }

  /**
   * O outro lado pode nos mandar uma oferta antes de terminarmos de montar o
   * nosso lado (abrir o microfone leva tempo, e pode até falhar). Jogar essas
   * mensagens fora trava a conexão em 'new' para sempre — então guardamos até
   * o par existir.
   */
  handleSignal(from, data) {
    const peer = this.peers.get(from);
    if (peer) return peer.handleSignal(data);

    if (!this.pending.has(from)) {
      this.pending.set(from, []);
      // Rede de segurança: se o par nunca aparecer, não vaza memória.
      setTimeout(() => this.pending.delete(from), 30000);
    }
    this.pending.get(from).push(data);
  }

  setPeerState(sid, state) {
    const peer = this.peers.get(sid);
    if (!peer) return;
    peer.state = state;
    this.emit('peerchange', peer);
  }

  /* ================================================== tela ============= */

  async startScreen() {
    if (this.local.screenStream) return;
    const q = this.quality;

    const constraints = {
      video: {
        width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps },
      },
      audio: {
        channelCount: 2, sampleRate: 48000,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        suppressLocalAudioPlayback: false,
      },
      systemAudio: 'include', surfaceSwitching: 'include', selfBrowserSurface: 'exclude',
    };

    let captured;
    try {
      captured = await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err) {
      // Algumas versões do Chromium/Electron rejeitam hints novos. Uma
      // segunda tentativa mínima mantém a captura funcionando nesses casos.
      if (err.name === 'TypeError' || err.name === 'OverconstrainedError') {
        try { captured = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); }
        catch (fallbackErr) { err = fallbackErr; }
      }
      if (!captured) {
        const message = err.name === 'NotAllowedError'
          ? 'Compartilhamento cancelado ou bloqueado. Verifique a permissão de captura de tela do Windows.'
          : 'Não foi possível capturar a tela: ' + (err.message || err.name);
        this.emit('notice', message);
        return;
      }
    }

    const video = captured.getVideoTracks()[0];
    if (!video) {
      for (const track of captured.getTracks()) track.stop();
      this.emit('notice', 'A fonte escolhida não entregou vídeo. Tente outra tela ou janela.');
      return;
    }
    video.contentHint = this.contentHint;
    video.addEventListener('ended', () => this.stopScreen());

    // No Electron a captura vem do desktopCapturer e ignora parte das
    // constraints iniciais; reforçamos aqui.
    video.applyConstraints({
      width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps },
    }).catch(() => {});

    for (const a of captured.getAudioTracks()) a.contentHint = 'music';

    if (!captured.getAudioTracks().length) {
      this.emit('notice', isDesktop()
        ? 'Tela sem áudio — o áudio do sistema só é capturado no Windows.'
        : 'Tela sem áudio. Marque "Compartilhar áudio da guia/sistema" na janela de seleção.');
    }

    this.local.screenStream = captured;
    for (const peer of this.peers.values()) peer.addScreen(captured);

    this.publishState();
    this.emit('localchange');
    this.emit('screenstart');
  }

  stopScreen() {
    const stream = this.local.screenStream;
    if (!stream) return;
    for (const peer of this.peers.values()) peer.removeScreen();
    for (const t of stream.getTracks()) t.stop();
    this.local.screenStream = null;
    this.publishState();
    this.emit('localchange');
    this.emit('screenstop');
  }

  isSharing() { return !!this.local.screenStream; }

  /* ================================================== estado =========== */

  publishState() {
    if (!this.socket || !this.inRoom) return;
    this.socket.emit('voice:state', {
      mic: this.micOpen(),
      screen: !!this.local.screenStream,
      speaking: this.speaking,
      annot: Settings.get('annotAllow'),
      streams: {
        mic: this.local.micStream ? this.local.micStream.id : null,
        screen: this.local.screenStream ? this.local.screenStream.id : null,
      },
    });
  }

  /* ================================================== diagnóstico ====== */

  async report() {
    const lines = [];
    lines.push(`Qualidade alvo : ${this.quality.label}`);
    lines.push(`Vídeo até      : ${(this.quality.video / 1e6).toFixed(1)} Mbps`);
    lines.push(`Áudio da tela  : ${(this.quality.audio / 1000).toFixed(0)} kbps estéreo`);
    lines.push(`Modo           : ${this.contentHint === 'detail' ? 'Nitidez (texto)' : 'Fluidez (movimento)'}`);
    lines.push(`Enviando tela  : ${this.isSharing() ? 'sim' : 'não'}`);
    lines.push('');

    if (!this.peers.size) lines.push('Ninguém mais na sala.');

    for (const peer of this.peers.values()) {
      lines.push(`— ${peer.user.name} [${peer.pc.connectionState}] —`);
      let stats;
      try { stats = await peer.pc.getStats(); } catch { continue; }

      let route = null;
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) route = r;
      });
      if (route) {
        let localType = '?';
        stats.forEach((r) => { if (r.id === route.localCandidateId) localType = r.candidateType; });
        const via = localType === 'relay' ? 'via servidor TURN'
                  : localType === 'host' ? 'rede local' : 'P2P (STUN)';
        lines.push(`  rota    : ${via}`);
        if (route.currentRoundTripTime != null) {
          lines.push(`  ping    : ${Math.round(route.currentRoundTripTime * 1000)} ms`);
        }
      }

      stats.forEach((r) => {
        if (r.type === 'outbound-rtp' && r.kind === 'video' && !r.isRemote) {
          const kbps = r.targetBitrate ? Math.round(r.targetBitrate / 1000) : null;
          lines.push(`  enviando : ${r.frameWidth || '?'}x${r.frameHeight || '?'} @ ${Math.round(r.framesPerSecond || 0)}fps`
            + (kbps ? ` (${kbps} kbps)` : ''));
          if (r.qualityLimitationReason && r.qualityLimitationReason !== 'none') {
            const motivo = { cpu: 'CPU', bandwidth: 'banda', other: 'outro' }[r.qualityLimitationReason];
            lines.push(`  limitado por: ${motivo}`);
          }
        }
        if (r.type === 'inbound-rtp' && r.kind === 'video') {
          lines.push(`  recebendo: ${r.frameWidth || '?'}x${r.frameHeight || '?'} @ ${Math.round(r.framesPerSecond || 0)}fps`);
          if (r.packetsLost) lines.push(`  pacotes perdidos: ${r.packetsLost}`);
        }
      });
      lines.push('');
    }
    return lines.join('\n');
  }
}

window.QUALITY_PRESETS = QUALITY_PRESETS;
window.Voice = new VoiceEngine();
