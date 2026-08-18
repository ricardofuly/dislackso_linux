import type { Peer } from './peer';

const CHECK_INTERVAL_MS = 4000;
/** Abaixo desta fração do FPS alvo, a rede claramente não está sustentando. */
const FPS_FLOOR_RATIO = 0.4;
/** Quantas medições ruins seguidas antes de descer um degrau. */
const STRIKES_TO_DOWNGRADE = 3;

interface CongestionOptions {
  peers: () => Iterable<Peer>;
  /** FPS que estamos anunciando agora. */
  targetFps: () => number;
  /** Chamado quando a rede não está dando conta por tempo suficiente. */
  onCongested: () => void;
}

/**
 * Vigia o bitrate real da transmissão.
 *
 * Anunciar "1080p60" e entregar 4 fps por minutos a fio é pior do que descer
 * sozinho para um degrau que a rede sustenta. As estatísticas do WebRTC dizem
 * as duas coisas de que precisamos: o FPS que está realmente saindo, e o
 * motivo que o próprio navegador dá para estar limitando.
 *
 * Só reage a `bandwidth`. Limitação por CPU se resolve fechando outra coisa,
 * não baixando a qualidade da chamada — e derrubar a resolução nesse caso
 * puniria o usuário por um problema que não é de rede.
 */
export class CongestionWatch {
  private timer: ReturnType<typeof setInterval> | null = null;
  private strikes = 0;

  constructor(private readonly o: CongestionOptions) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => void this.sample(), CHECK_INTERVAL_MS);
  }

  private async sample(): Promise<void> {
    let worstFps = Infinity;
    let bandwidthLimited = false;

    for (const peer of this.o.peers()) {
      let stats: RTCStatsReport;
      try {
        stats = await peer.pc.getStats();
      } catch {
        continue;
      }
      stats.forEach((report) => {
        const r = report as RTCOutboundRtpStreamStats & { qualityLimitationReason?: string };
        if (r.type !== 'outbound-rtp' || r.kind !== 'video') return;
        worstFps = Math.min(worstFps, r.framesPerSecond ?? 0);
        if (r.qualityLimitationReason === 'bandwidth') bandwidthLimited = true;
      });
    }

    if (worstFps === Infinity) return; // ainda sem estatísticas: conexão recém-aberta

    const struggling = bandwidthLimited && worstFps < this.o.targetFps() * FPS_FLOOR_RATIO;
    if (!struggling) {
      this.strikes = 0;
      return;
    }

    if (++this.strikes >= STRIKES_TO_DOWNGRADE) {
      this.strikes = 0;
      this.o.onCongested();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.strikes = 0;
  }
}
