import { clamp } from '@/lib/format';
import { settings, useSettings } from '@/stores/settings';

/** Acima disto (0..255, média do espectro) consideramos que a pessoa está falando. */
const SPEAKING_THRESHOLD = 12;

interface MicCallbacks {
  /** Nível instantâneo (0..1) — alimenta o medidor das configurações. */
  onLevel(level: number): void;
  /** Só dispara na transição, não a cada quadro. */
  onSpeakingChange(speaking: boolean): void;
  /** O usuário mudou o estado do microfone (mudo, apertar-para-falar). */
  onToggled(open: boolean): void;
}

/**
 * O microfone passa por um grafo de Web Audio: fonte → ganho → destino.
 *
 * Não é firula. O grafo é o que permite três coisas que a faixa crua não dá:
 * volume de entrada ajustável, medidor de voz (o "está falando" que acende o
 * avatar), e trocar de aparelho com um `replaceTrack` — sem renegociar SDP
 * com todo mundo da sala.
 */
export class MicGraph {
  private raw: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Uint8Array<ArrayBuffer> | null = null;
  private raf = 0;

  /** O que sai para os pares (já com o ganho aplicado). */
  stream: MediaStream | null = null;
  speaking = false;
  level = 0;

  /** O que o usuário escolheu — diferente de "está passando áudio agora". */
  enabled = false;
  private pttHeld = false;

  constructor(private readonly cb: MicCallbacks) {}

  /**
   * Abre o microfone e monta o grafo. Se o aparelho escolhido sumiu (foi
   * desconectado), volta para o padrão do sistema em vez de falhar — é o
   * caso comum de headset USB removido com o app aberto.
   */
  async open(): Promise<MediaStreamTrack> {
    const s = settings();
    const constraints: MediaStreamConstraints = {
      audio: {
        channelCount: 1,
        echoCancellation: s.echoCancellation,
        noiseSuppression: s.noiseSuppression,
        autoGainControl: s.autoGainControl,
        ...(s.micId ? { deviceId: { exact: s.micId } } : {}),
      },
    };

    let raw: MediaStream;
    try {
      raw = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const name = (err as Error).name;
      if (s.micId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
        useSettings.getState().set('micId', '');
        return this.open();
      }
      throw err;
    }

    // Só o grafo: trocar de aparelho no meio da chamada não pode remutar
    // quem já estava com o microfone aberto.
    this.teardownGraph();
    this.raw = raw;
    return this.buildGraph(raw, clamp(Number(s.micGain) || 1, 0, 3));
  }

  private buildGraph(raw: MediaStream, gainValue: number): MediaStreamTrack {
    const ctx = new AudioContext({ sampleRate: 48000 });
    const source = ctx.createMediaStreamSource(raw);
    const gain = ctx.createGain();
    gain.gain.value = gainValue;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;

    const destination = ctx.createMediaStreamDestination();
    source.connect(gain);
    gain.connect(destination);
    gain.connect(analyser);

    this.ctx = ctx;
    this.gain = gain;
    this.analyser = analyser;
    this.buffer = new Uint8Array(analyser.frequencyBinCount);
    this.stream = destination.stream;

    this.watchLevel();
    return destination.stream.getAudioTracks()[0]!;
  }

  setGain(value: number): void {
    if (this.gain) this.gain.gain.value = clamp(Number(value) || 1, 0, 3);
  }

  /* ------------------------------------------------------- o que sai --- */

  /**
   * O microfone está realmente passando áudio agora?
   *
   * São duas condições diferentes: o usuário quer falar (`enabled`) e, no modo
   * apertar-para-falar, a tecla está de fato pressionada.
   */
  isOpen(): boolean {
    if (!this.stream || !this.enabled) return false;
    return settings().micMode === 'ptt' ? this.pttHeld : true;
  }

  /** Aplica a decisão à faixa. Silencia sem derrubar a conexão. */
  sync(): void {
    const open = this.isOpen();
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = open;
    if (!open && this.speaking) {
      this.speaking = false;
      this.cb.onSpeakingChange(false);
    }
  }

  /** Devolve o novo estado, ou `null` se não há microfone para alternar. */
  toggle(): boolean | null {
    if (!this.stream) return null;
    this.enabled = !this.enabled;
    this.sync();
    this.cb.onToggled(this.enabled);
    return this.enabled;
  }

  setPtt(held: boolean): void {
    if (this.pttHeld === held) return;
    this.pttHeld = held;
    this.sync();
    this.cb.onToggled(this.isOpen());
  }

  private watchLevel(): void {
    const tick = () => {
      const { analyser, buffer } = this;
      if (!analyser || !buffer) return;

      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (const v of buffer) sum += v;
      const average = sum / buffer.length;

      this.level = average / 255;
      this.cb.onLevel(this.level);

      const enabled = this.stream?.getAudioTracks().some((t) => t.enabled) ?? false;
      const speaking = enabled && average > SPEAKING_THRESHOLD;
      if (speaking !== this.speaking) {
        this.speaking = speaking;
        this.cb.onSpeakingChange(speaking);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Desmonta o grafo de áudio e solta o aparelho, sem tocar na escolha do usuário. */
  private teardownGraph(): void {
    cancelAnimationFrame(this.raf);
    for (const track of this.raw?.getTracks() ?? []) track.stop();
    try {
      void this.ctx?.close();
    } catch {
      /* já fechado */
    }
    this.raw = null;
    this.ctx = null;
    this.gain = null;
    this.analyser = null;
    this.buffer = null;
    this.stream = null;
    this.raf = 0;
    this.speaking = false;
    this.level = 0;
  }

  /** Encerra de vez: sai da sala, esquece também mudo e apertar-para-falar. */
  close(): void {
    this.teardownGraph();
    this.enabled = false;
    this.pttHeld = false;
  }
}
