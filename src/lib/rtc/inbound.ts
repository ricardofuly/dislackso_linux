import type { VoiceState } from '@/types/api';

/**
 * O que chega de um participante.
 *
 * Um par pode mandar dois streams ao mesmo tempo (microfone e tela) e eles
 * chegam em ordem imprevisível. Quem manda anuncia os ids em `voice:state`,
 * mas a mídia costuma chegar antes do anúncio — por isso cada busca tem um
 * palpite de reserva baseado no tipo de faixa.
 */
export class InboundStreams {
  private readonly streams = new Map<string, MediaStream>();

  /** @param onChange chamado sempre que a lista de faixas muda de verdade. */
  constructor(private readonly onChange: () => void) {}

  accept(event: RTCTrackEvent): void {
    const stream = event.streams[0];
    if (!stream) return;

    if (!this.streams.has(stream.id)) {
      this.streams.set(stream.id, stream);
      stream.addEventListener('removetrack', () => {
        if (stream.getTracks().length === 0) {
          this.streams.delete(stream.id);
          this.onChange();
        }
      });
    }
    // Uma faixa que termina ou volta a tocar muda o que dá para exibir.
    event.track.addEventListener('ended', this.onChange);
    event.track.addEventListener('unmute', this.onChange);
    this.onChange();
  }

  screen(state: VoiceState | undefined): MediaStream | null {
    const announced = this.byId(state?.streams?.screen);
    if (announced) return announced;
    for (const s of this.streams.values()) if (s.getVideoTracks().length) return s;
    return null;
  }

  mic(state: VoiceState | undefined): MediaStream | null {
    const announced = this.byId(state?.streams?.mic);
    if (announced) return announced;
    for (const s of this.streams.values()) {
      if (!s.getVideoTracks().length && s.getAudioTracks().length) return s;
    }
    return null;
  }

  private byId(id: string | null | undefined): MediaStream | null {
    return id ? (this.streams.get(id) ?? null) : null;
  }

  clear(): void {
    this.streams.clear();
  }
}
