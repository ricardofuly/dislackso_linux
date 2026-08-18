import { create } from 'zustand';
import type { ScreenChoice, ScreenSource } from '@/lib/platform';

interface ScreenPickerState {
  /** `null` quando não há pedido pendente — é o que fecha a modal. */
  sources: ScreenSource[] | null;
  resolve: ((choice: ScreenChoice | null) => void) | null;
  /** Chamado pelo Electron (via `onPickScreen`) quando abre o pedido de captura. */
  request(sources: ScreenSource[]): Promise<ScreenChoice | null>;
  /** Chamado pela modal quando a pessoa escolhe ou cancela. */
  respond(choice: ScreenChoice | null): void;
}

/**
 * A ponte entre o pedido de captura do Electron e a modal que o usuário vê.
 *
 * `session.setDisplayMediaRequestHandler` no processo principal manda a
 * lista de telas e janelas e espera uma resposta assíncrona; este store
 * segura essa promessa até a interface responder.
 */
export const useScreenPicker = create<ScreenPickerState>()((set, get) => ({
  sources: null,
  resolve: null,

  request(sources) {
    return new Promise((resolve) => {
      // Um pedido novo enquanto outro está pendente não deveria acontecer
      // (o Electron só faz um por vez), mas por segurança cancela o anterior
      // em vez de vazar a promessa.
      get().resolve?.(null);
      set({ sources, resolve });
    });
  },

  respond(choice) {
    get().resolve?.(choice);
    set({ sources: null, resolve: null });
  },
}));
