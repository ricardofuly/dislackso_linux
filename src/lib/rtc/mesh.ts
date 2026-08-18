import type { PeerInfo, VoiceState } from '@/types/api';
import { tell } from '@/lib/socket/client';
import { Peer, type PeerHost } from './peer';
import type { QualityPreset } from './quality';

/** Prazo para um sinal órfão ser descartado — ver `handleSignal`. */
const PENDING_TTL_MS = 30_000;

interface MeshDeps {
  sid: () => string;
  iceServers: () => RTCIceServer[];
  quality: () => QualityPreset;
  localScreen: () => MediaStream | null;
  localMic: () => MediaStream | null;
  onPeersChange: () => void;
  onPeerChange: (peer: Peer) => void;
  onNotice: (message: string) => void;
}

/**
 * A malha de conexões diretas com os outros participantes da sala.
 *
 * Cada pessoa mantém uma RTCPeerConnection com cada uma das outras. Esta
 * classe cuida do ciclo de vida delas — criar, alimentar com sinais, destruir
 * — e nada mais: não sabe de microfone, tela ou qualidade, só repassa o que o
 * motor lhe dá.
 */
export class PeerMesh implements PeerHost {
  readonly peers = new Map<string, Peer>();

  /** Sinais que chegaram antes do par existir. */
  private readonly pending = new Map<string, unknown[]>();

  constructor(private readonly deps: MeshDeps) {}

  get sid(): string {
    return this.deps.sid();
  }
  get iceServers(): RTCIceServer[] {
    return this.deps.iceServers();
  }
  get quality(): QualityPreset {
    return this.deps.quality();
  }
  get localScreen(): MediaStream | null {
    return this.deps.localScreen();
  }
  get localMic(): MediaStream | null {
    return this.deps.localMic();
  }

  signal(to: string, data: unknown): void {
    tell('rtc:signal', { to, data });
  }

  onPeerChanged(peer: Peer): void {
    this.deps.onPeerChange(peer);
  }

  onNotice(message: string): void {
    this.deps.onNotice(message);
  }

  /* ---------------------------------------------------------------------- */

  add(info: PeerInfo): void {
    if (this.peers.has(info.sid) || info.sid === this.sid) return;

    const peer = new Peer(this, info.sid, info);
    this.peers.set(info.sid, peer);

    for (const queued of this.pending.get(info.sid) ?? []) peer.handleSignal(queued);
    this.pending.delete(info.sid);

    this.deps.onPeersChange();
  }

  remove(sid: string): void {
    const peer = this.peers.get(sid);
    if (!peer) return;
    peer.close();
    this.peers.delete(sid);
    this.deps.onPeersChange();
  }

  /**
   * O outro lado pode mandar uma oferta antes de terminarmos de montar o
   * nosso (abrir o microfone leva tempo, e pode até falhar). Jogar essas
   * mensagens fora trava a conexão em `new` para sempre — então guardamos até
   * o par existir, com prazo de validade para não vazar memória.
   */
  handleSignal(from: string, data: unknown): void {
    const peer = this.peers.get(from);
    if (peer) return peer.handleSignal(data);

    if (!this.pending.has(from)) {
      this.pending.set(from, []);
      setTimeout(() => this.pending.delete(from), PENDING_TTL_MS);
    }
    this.pending.get(from)!.push(data);
  }

  setPeerState(sid: string, state: VoiceState): void {
    const peer = this.peers.get(sid);
    if (!peer) return;
    peer.state = state;
    this.deps.onPeerChange(peer);
  }

  /** Reafina os encoders de todo mundo — chamado quando a qualidade muda. */
  retuneAll(): void {
    for (const peer of this.peers.values()) peer.retuneSenders();
  }

  /** Para de mandar a tela para todos (quando paro de transmitir). */
  removeScreenEverywhere(): void {
    for (const peer of this.peers.values()) peer.removeScreen();
  }

  /** Troca a faixa de microfone em todas as conexões, sem renegociar. */
  async swapMicEverywhere(track: MediaStreamTrack): Promise<void> {
    for (const peer of this.peers.values()) await peer.swapMic(track);
  }

  close(): void {
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.pending.clear();
  }
}
