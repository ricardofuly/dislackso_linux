import { preferCodecs, tuneSender } from './sdp';
import type { QualityPreset } from './quality';

/** A voz não precisa de mais que isto; o resto da banda é da tela. */
const MIC_BITRATE = 96_000;

/**
 * O que eu envio para um participante.
 *
 * Par simétrico do `InboundStreams`. A assimetria que importa está aqui: o
 * microfone vai para todo mundo assim que a conexão abre, mas a tela **não** —
 * ela só é adicionada quando a pessoa pede para assistir (ver `watch` em
 * Peer). Numa sala de cinco, mandar 8 Mbps para quatro seria 32 Mbps de
 * subida, que quase nenhuma conexão doméstica tem.
 */
export class OutboundTracks {
  private mic: RTCRtpSender | null = null;
  private screenVideo: RTCRtpSender | null = null;
  private screenAudio: RTCRtpSender | null = null;

  constructor(private readonly pc: RTCPeerConnection) {}

  /** `true` se já estou mandando a tela para este par. */
  get sendingScreen(): boolean {
    return Boolean(this.screenVideo);
  }

  publishMic(stream: MediaStream | null): void {
    if (!stream) return;
    for (const track of stream.getAudioTracks()) {
      this.mic = this.pc.addTrack(track, stream);
    }
  }

  addScreen(stream: MediaStream): void {
    if (this.screenVideo) return; // já está assistindo
    for (const track of stream.getVideoTracks()) {
      this.screenVideo = this.pc.addTrack(track, stream);
    }
    for (const track of stream.getAudioTracks()) {
      this.screenAudio = this.pc.addTrack(track, stream);
    }
  }

  removeScreen(): void {
    for (const key of ['screenVideo', 'screenAudio'] as const) {
      const sender = this[key];
      if (!sender) continue;
      try {
        this.pc.removeTrack(sender);
      } catch (err) {
        console.warn('[rtc]', (err as Error).message);
      }
      this[key] = null;
    }
  }

  /** Troca a faixa de microfone sem renegociar — usado ao mudar de aparelho. */
  async swapMic(track: MediaStreamTrack): Promise<void> {
    if (!this.mic) return;
    try {
      await this.mic.replaceTrack(track);
    } catch (err) {
      console.warn('[rtc] replaceTrack falhou:', (err as Error).message);
    }
  }

  /** Reaplica codec e limites de bitrate. Chamado a cada negociação e troca de qualidade. */
  retune(q: QualityPreset): void {
    if (this.screenVideo) {
      preferCodecs(this.pc.getTransceivers().find((t) => t.sender === this.screenVideo));
      void tuneSender(this.screenVideo, { bitrate: q.video, fps: q.fps, keepResolution: true });
    }
    if (this.screenAudio) void tuneSender(this.screenAudio, { bitrate: q.audio });
    if (this.mic) void tuneSender(this.mic, { bitrate: MIC_BITRATE });
  }
}
