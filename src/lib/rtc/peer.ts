import type { PeerInfo, VoiceState } from '@/types/api';
import { preferCodecs, tuneSender } from './sdp';
import { Negotiator, type SignalData } from './negotiation';
import { InboundStreams } from './inbound';
import type { QualityPreset } from './quality';

/** O que um Peer precisa saber do motor — mantém a dependência num sentido só. */
export interface PeerHost {
  readonly sid: string;
  readonly iceServers: RTCIceServer[];
  readonly quality: QualityPreset;
  readonly localScreen: MediaStream | null;
  readonly localMic: MediaStream | null;
  signal(to: string, data: unknown): void;
  onPeerChanged(peer: Peer): void;
  onNotice(message: string): void;
}

const MIC_BITRATE = 96_000;
/** Depois disso sem conectar, avisamos que provavelmente é a rede travando. */
const STUCK_WARNING_MS = 20_000;

/**
 * Uma conexão direta com outro participante.
 *
 * A malha é ponto a ponto: cada pessoa abre uma RTCPeerConnection com cada
 * uma das outras. O servidor só apresenta os dois lados; áudio e vídeo nunca
 * passam por ele.
 *
 * Esta classe cuida das faixas (quem manda o quê para quem). O aperto de mão
 * em si mora no `Negotiator`.
 */
export class Peer {
  readonly pc: RTCPeerConnection;
  user: PeerInfo['user'];
  state: VoiceState;

  private readonly negotiator: Negotiator;
  private readonly inbound = new InboundStreams(() => this.host.onPeerChanged(this));
  private senders: Record<'mic' | 'screenVideo' | 'screenAudio', RTCRtpSender | null> = {
    mic: null,
    screenVideo: null,
    screenAudio: null,
  };

  private stuckWarned = false;
  private readonly stuckTimer: ReturnType<typeof setTimeout>;

  constructor(
    private readonly host: PeerHost,
    readonly sid: string,
    info: PeerInfo,
  ) {
    this.user = info.user;
    this.state = info.state;

    this.pc = new RTCPeerConnection({
      iceServers: host.iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    this.negotiator = new Negotiator({
      pc: this.pc,
      polite: host.sid > sid,
      audioBitrate: () => this.host.quality.audio,
      send: (data) => this.send(data),
      onNegotiated: () => this.retuneSenders(),
    });

    this.pc.onnegotiationneeded = () => void this.negotiator.offer();
    this.pc.onicecandidate = ({ candidate }) => candidate && this.send({ candidate });
    this.pc.ontrack = (event) => this.inbound.accept(event);
    this.pc.onconnectionstatechange = () => this.onConnectionState();

    // Quem está atrás de CGNAT/NAT simétrico (comum em internet via rádio,
    // 4G e 5G) fica preso em "conectando…" para sempre sem nenhuma pista do
    // porquê. O restartIce() tenta de novo em silêncio; isto aqui explica.
    this.stuckTimer = setTimeout(() => this.warnIfStuck(), STUCK_WARNING_MS);

    this.publishLocalTracks();

    // Se nenhum dos dois tem faixa para enviar, nada dispara a negociação.
    // O lado impaciente abre a conversa para o handshake acontecer mesmo assim.
    if (host.sid <= sid && this.pc.getSenders().length === 0) {
      this.pc.addTransceiver('audio', { direction: 'recvonly' });
    }
  }

  send(data: SignalData): void {
    this.host.signal(this.sid, data);
  }

  /**
   * Sinais de fora. `watch`/`unwatch` são pedidos do outro lado para eu
   * começar ou parar de mandar a minha tela só para ele — reaproveitam o
   * canal de sinalização em vez de inventar um evento de socket novo, e por
   * isso são resolvidos aqui antes de chegarem ao negociador.
   */
  handleSignal(data: unknown): void {
    const signal = data as SignalData;
    if ('watch' in signal) {
      if (this.host.localScreen) this.addScreen(this.host.localScreen);
      return;
    }
    if ('unwatch' in signal) {
      this.removeScreen();
      return;
    }
    this.negotiator.enqueue(signal);
  }

  private onConnectionState(): void {
    this.host.onPeerChanged(this);
    if (this.pc.connectionState === 'connected') {
      this.stuckWarned = false; // pode falhar e reconectar de novo depois
    } else if (this.pc.connectionState === 'failed') {
      console.warn('[rtc] conexão falhou com', this.user.name, '- reiniciando ICE');
      try {
        this.pc.restartIce();
      } catch {
        /* navegador antigo sem restartIce: o par simplesmente não reconecta */
      }
    }
  }

  private warnIfStuck(): void {
    if (this.pc.connectionState === 'connected' || this.stuckWarned) return;
    this.stuckWarned = true;
    this.host.onNotice(
      `Demorando pra conectar com ${this.user.name} — provavelmente a rede de um dos dois `
        + 'bloqueia conexão direta. Tentando por um retransmissor; se continuar travado, '
        + 'considere configurar um servidor TURN (veja DEPLOY.md).',
    );
  }

  /* ------------------------------------------------ mídia que sai --- */

  private publishLocalTracks(): void {
    // A tela NÃO entra aqui: ela só é enviada a quem pedir para assistir (ver
    // `watch`/`unwatch`). O microfone, sim, vai para todo mundo.
    const mic = this.host.localMic;
    if (mic) {
      for (const track of mic.getAudioTracks()) this.senders.mic = this.pc.addTrack(track, mic);
    }
    this.retuneSenders();
  }

  retuneSenders(): void {
    const q = this.host.quality;
    if (this.senders.screenVideo) {
      const transceiver = this.pc
        .getTransceivers()
        .find((t) => t.sender === this.senders.screenVideo);
      preferCodecs(transceiver);
      void tuneSender(this.senders.screenVideo, {
        bitrate: q.video,
        fps: q.fps,
        keepResolution: true,
      });
    }
    if (this.senders.screenAudio) void tuneSender(this.senders.screenAudio, { bitrate: q.audio });
    if (this.senders.mic) void tuneSender(this.senders.mic, { bitrate: MIC_BITRATE });
  }

  addScreen(stream: MediaStream): void {
    if (this.senders.screenVideo) return; // já está assistindo
    for (const track of stream.getVideoTracks()) {
      this.senders.screenVideo = this.pc.addTrack(track, stream);
    }
    for (const track of stream.getAudioTracks()) {
      this.senders.screenAudio = this.pc.addTrack(track, stream);
    }
    this.retuneSenders();
  }

  removeScreen(): void {
    for (const key of ['screenVideo', 'screenAudio'] as const) {
      const sender = this.senders[key];
      if (!sender) continue;
      try {
        this.pc.removeTrack(sender);
      } catch (err) {
        console.warn('[rtc]', (err as Error).message);
      }
      this.senders[key] = null;
    }
  }

  /** Troca a faixa de microfone sem renegociar — usado ao mudar de aparelho. */
  async swapMic(track: MediaStreamTrack): Promise<void> {
    if (!this.senders.mic) return;
    try {
      await this.senders.mic.replaceTrack(track);
    } catch (err) {
      console.warn('[rtc] replaceTrack falhou:', (err as Error).message);
    }
  }

  /* ----------------------------------------------- mídia que chega --- */

  screenStream(): MediaStream | null {
    return this.inbound.screen(this.state);
  }

  micStream(): MediaStream | null {
    return this.inbound.mic(this.state);
  }

  close(): void {
    clearTimeout(this.stuckTimer);
    try {
      this.pc.close();
    } catch {
      /* já estava fechada */
    }
    this.inbound.clear();
  }
}
