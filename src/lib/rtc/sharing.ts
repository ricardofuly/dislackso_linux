import { tell } from '@/lib/socket/client';
import { annot } from '@/lib/annot/engine';
import { CongestionWatch } from './congestion';
import { PreviewLoop } from './preview';
import type { QualityPreset } from './quality';
import { captureScreen } from './screen';
import type { PeerMesh } from './mesh';

interface SharingDeps {
  mesh: PeerMesh;
  quality: () => QualityPreset;
  contentHint: () => string;
  onNotice: (message: string) => void;
  onChange: () => void;
  onStart: () => void;
  onStop: () => void;
  /** A rede não está sustentando a qualidade anunciada. */
  onCongested: () => void;
}

/**
 * O compartilhamento de tela, de ponta a ponta.
 *
 * A decisão de arquitetura que importa aqui: a tela **não** é enviada
 * automaticamente para ninguém. Numa sala de cinco pessoas, transmitir 8 Mbps
 * para quatro é 32 Mbps de subida — o que a maioria das conexões domésticas
 * não tem. Em vez disso todo mundo recebe uma prévia estática e leve, e quem
 * realmente quer assistir pede o vídeo (ver `watch` em Peer).
 */
export class ScreenSharing {
  stream: MediaStream | null = null;

  private readonly preview = new PreviewLoop((dataUrl) => tell('screen:preview', { dataUrl }));
  private readonly congestion: CongestionWatch;

  constructor(private readonly deps: SharingDeps) {
    this.congestion = new CongestionWatch({
      peers: () => deps.mesh.peers.values(),
      targetFps: () => deps.quality().fps,
      onCongested: deps.onCongested,
    });
  }

  get active(): boolean {
    return Boolean(this.stream);
  }

  get previewHidden(): boolean {
    return this.preview.hidden;
  }

  async start(): Promise<void> {
    if (this.stream) return;

    const result = await captureScreen(this.deps.quality(), this.deps.contentHint(), this.deps.onNotice);
    if (!result) return;

    for (const notice of result.notices) this.deps.onNotice(notice);

    this.stream = result.stream;
    // Parar pela barra do navegador/sistema tem de derrubar a transmissão aqui também.
    result.stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop());

    this.congestion.start();
    this.preview.start(result.stream);
    this.deps.onStart();
    annot.startOverlay();
  }

  stop(): void {
    const stream = this.stream;
    if (!stream) return;

    annot.stopOverlay();
    this.preview.stop();
    this.congestion.stop();
    this.deps.mesh.removeScreenEverywhere();
    for (const track of stream.getTracks()) track.stop();
    this.stream = null;

    this.deps.onStop();
  }

  /** Aplica a nova qualidade na captura já em andamento. */
  applyQuality(q: QualityPreset): void {
    void this.stream
      ?.getVideoTracks()[0]
      ?.applyConstraints({
        width: { ideal: q.w, max: q.w },
        height: { ideal: q.h, max: q.h },
        frameRate: { ideal: q.fps, max: q.fps },
      })
      .catch((err: Error) => console.warn('[rtc] applyConstraints:', err.message));
  }

  applyContentHint(hint: string): void {
    const track = this.stream?.getVideoTracks()[0];
    if (track) track.contentHint = hint;
  }

  setPreviewHidden(hidden: boolean): void {
    this.preview.setHidden(hidden, this.stream);
    this.deps.onChange();
  }

  /** Encerra tudo sem avisar ninguém — usado ao sair da sala. */
  dispose(): void {
    annot.stopOverlay();
    this.preview.stop();
    this.congestion.stop();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }
}
