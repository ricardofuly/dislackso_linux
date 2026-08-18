import type { Peer } from './peer';

/**
 * O que o motor de mídia conta para a interface.
 *
 * Ficam separados do motor porque também são o contrato de quem escuta — o
 * `useEngineBridge` no lado do React se apoia exatamente nesta lista.
 */
export interface VoiceEvents {
  /** Alguém entrou ou saiu — a lista de participantes mudou. */
  peerschange: void;
  /** Um participante mudou de estado (mídia, conexão). */
  peerchange: Peer;
  /** Mudou algo do lado de cá (microfone, tela, qualidade). */
  localchange: void;
  notice: string;
  screenstart: void;
  screenstop: void;
  qualitydowngraded: string;
  level: number;
}
