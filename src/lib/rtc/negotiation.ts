import { tuneOpus } from './sdp';

/** Mensagens que trafegam no canal `rtc:signal` além de SDP e ICE. */
export type SignalData =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit }
  | { watch: true }
  | { unwatch: true };

interface NegotiatorOptions {
  pc: RTCPeerConnection;
  /**
   * Numa colisão de ofertas alguém precisa recuar. Os dois lados calculam
   * isto a partir da mesma comparação de ids, com resultados opostos — é o
   * que garante que exatamente um cede.
   */
  polite: boolean;
  /** Bitrate de áudio alvo; lido a cada oferta porque a qualidade muda em voo. */
  audioBitrate: () => number;
  send: (data: SignalData) => void;
  /** Chamado depois de cada descrição aplicada, para reafinar os encoders. */
  onNegotiated: () => void;
}

/**
 * Negociação perfeita (perfect negotiation), o padrão do WebRTC para os dois
 * lados poderem começar a falar ao mesmo tempo sem travar o handshake.
 *
 * Está separado do `Peer` porque é uma máquina de estados fechada: recebe
 * descrições e candidatos, devolve descrições e candidatos, e não sabe nada
 * sobre telas, microfones ou usuários.
 */
export class Negotiator {
  private makingOffer = false;
  private ignoreOffer = false;
  /** Sinais precisam ser aplicados na ordem em que chegaram. */
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly o: NegotiatorOptions) {}

  /** O último candidato recusado deve ser ignorado em silêncio? */
  get ignoringOffer(): boolean {
    return this.ignoreOffer;
  }

  async offer(): Promise<void> {
    try {
      this.makingOffer = true;
      const offer = await this.o.pc.createOffer();
      if (offer.sdp) offer.sdp = tuneOpus(offer.sdp, this.o.audioBitrate());
      await this.o.pc.setLocalDescription(offer);
      this.o.send({ description: this.o.pc.localDescription! });
    } catch (err) {
      console.error('[rtc] erro ao criar oferta:', err);
    } finally {
      this.makingOffer = false;
    }
  }

  /** Enfileira; `apply` é assíncrono e a ordem importa. */
  enqueue(data: SignalData): void {
    this.chain = this.chain
      .then(() => this.apply(data))
      .catch((err) => console.error('[rtc] signaling:', err));
  }

  private async apply(data: SignalData): Promise<void> {
    const pc = this.o.pc;
    if (pc.signalingState === 'closed') return;

    if ('description' in data) {
      await this.applyDescription(data.description);
    } else if ('candidate' in data) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        if (!this.ignoreOffer) console.warn('[rtc] candidato recusado:', (err as Error).message);
      }
    }
  }

  private async applyDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.o.pc;
    const collision = desc.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
    this.ignoreOffer = !this.o.polite && collision;
    if (this.ignoreOffer) return;

    await pc.setRemoteDescription(desc); // rollback implícito quando preciso

    if (desc.type === 'offer') {
      const answer = await pc.createAnswer();
      if (answer.sdp) answer.sdp = tuneOpus(answer.sdp, this.o.audioBitrate());
      await pc.setLocalDescription(answer);
      this.o.send({ description: pc.localDescription! });
    }
    this.o.onNegotiated();
  }
}
