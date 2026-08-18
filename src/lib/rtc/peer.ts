import type { PeerInfo, VoiceState } from '@/types/api';
import { Negotiator, type SignalData } from './negotiation';
import { InboundStreams } from './inbound';
import { OutboundTracks } from './outbound';
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

/** Depois disso sem conectar, avisamos que provavelmente é a rede travando. */
const STUCK_WARNING_MS = 20_000;

/**
 * Uma conexão direta com outro participante.
 *
 * A malha é ponto a ponto: cada pessoa abre uma RTCPeerConnection com cada
 * uma das outras. O servidor só apresenta os dois lados; áudio e vídeo nunca
 * passam por ele.
 *
 * Esta classe é o ponto de encontro de três peças: o `Negotiator` (aperto de
 * mão), o `InboundStreams` (o que chega) e o `OutboundTracks` (o que sai).
 */
export class Peer {
  readonly pc: RTCPeerConnection;
  user: PeerInfo['user'];
  state: VoiceState;

  private readonly negotiator: Negotiator;
  private readonly inbound = new InboundStreams(() => this.host.onPeerChanged(this));
  private readonly outbound: OutboundTracks;

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
    this.outbound = new OutboundTracks(this.pc);

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
    this.outbound.publishMic(this.host.localMic);
    this.retuneSenders();
  }

  retuneSenders(): void {
    this.outbound.retune(this.host.quality);
  }

  addScreen(stream: MediaStream): void {
    this.outbound.addScreen(stream);
    this.retuneSenders();
  }

  removeScreen(): void {
    this.outbound.removeScreen();
  }

  /** Troca a faixa de microfone sem renegociar — usado ao mudar de aparelho. */
  swapMic(track: MediaStreamTrack): Promise<void> {
    return this.outbound.swapMic(track);
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
