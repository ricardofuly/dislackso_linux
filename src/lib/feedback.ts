import { settings } from '@/stores/settings';

export type FeedbackKind =
  | 'join' | 'leave' | 'message' | 'announce'
  | 'mute' | 'unmute' | 'screenstart' | 'screenstop' | 'deafen' | 'undeafen';

/**
 * Notas de cada aviso, em Hz. Sequências curtas: subindo para "algo começou",
 * descendo para "algo terminou". Não usamos arquivos de áudio de propósito —
 * um oscilador não precisa ser baixado, não atrasa o boot e nunca falha por
 * 404 num build empacotado.
 */
const TONES: Record<FeedbackKind, number[]> = {
  join: [660, 880],
  leave: [420, 280],
  screenstart: [520, 780],
  screenstop: [780, 440],
  message: [720],
  announce: [560, 780, 990],
  mute: [520, 340],
  unmute: [520, 700],
  deafen: [480, 300, 220],
  undeafen: [480, 620, 780],
};

let ctx: AudioContext | null = null;

/**
 * Aviso curto: um sopro de luz no vidro mais uma nota.
 *
 * O visual sempre acontece; o som depende de o navegador já ter liberado
 * áudio (o que só ocorre depois da primeira interação do usuário). Quem
 * desligou "sons de aviso" nas configurações fica só com a luz.
 */
export function feedback(kind: FeedbackKind = 'message'): void {
  flare();
  if (!settings().feedbackSounds) return;
  try {
    playTones(TONES[kind] ?? [620]);
  } catch {
    /* sem permissão de áudio ainda: o aviso visual já aconteceu */
  }
}

/** Pulso de luz nas superfícies de vidro. Reinicia mesmo se já estiver rodando. */
function flare(): void {
  const { classList } = document.body;
  classList.remove('feedback-flare');
  void document.body.offsetWidth; // força o reflow para a animação recomeçar
  classList.add('feedback-flare');
  setTimeout(() => classList.remove('feedback-flare'), 560);
}

function playTones(freqs: number[]): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  freqs.forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    const start = ctx!.currentTime + i * 0.08;

    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.17);
  });
}
