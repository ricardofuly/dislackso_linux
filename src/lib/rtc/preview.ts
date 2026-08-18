/** Quadro a cada 6 s é o suficiente para "ver o que está rolando" sem custar banda. */
const PREVIEW_INTERVAL_MS = 6000;
/** Largura máxima da miniatura, em pixels. */
const PREVIEW_WIDTH = 320;
const PREVIEW_QUALITY = 0.45;

/**
 * Prévia estática da tela de quem transmite.
 *
 * O vídeo de verdade só é enviado para quem clica em "assistir". Até lá, cada
 * pessoa na sala vê esta miniatura — uma imagem pequena a cada poucos
 * segundos, que custa quase nada perto de um stream de 8 Mbps por
 * espectador. Quem transmite pode desligar até isso, para poupar CPU.
 */
export class PreviewLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private capture: ImageCapture | null = null;
  private readonly canvas = document.createElement('canvas');
  hidden = false;

  /** @param send recebe o data URL, ou `null` para limpar a prévia dos outros. */
  constructor(private readonly send: (dataUrl: string | null) => void) {}

  start(stream: MediaStream): void {
    this.stop();
    const track = stream.getVideoTracks()[0];
    if (!track || typeof ImageCapture === 'undefined') return;

    try {
      this.capture = new ImageCapture(track);
    } catch {
      return; // navegador sem ImageCapture: segue sem prévia, o resto funciona
    }

    void this.grab();
    this.timer = setInterval(() => void this.grab(), PREVIEW_INTERVAL_MS);
  }

  private async grab(): Promise<void> {
    if (this.hidden || !this.capture) return;
    try {
      const bitmap = await this.capture.grabFrame();
      const scale = Math.min(1, PREVIEW_WIDTH / bitmap.width);
      this.canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      this.canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      this.canvas.getContext('2d')?.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
      bitmap.close?.();
      this.send(this.canvas.toDataURL('image/jpeg', PREVIEW_QUALITY));
    } catch {
      /* um quadro perdido não é problema — tenta de novo no próximo tique */
    }
  }

  /** Liga/desliga o envio, para quem transmite poupar recurso. */
  setHidden(hidden: boolean, stream: MediaStream | null): void {
    this.hidden = hidden;
    if (hidden) {
      this.send(null);
    } else if (stream && !this.timer) {
      this.start(stream);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.capture = null;
  }
}
