import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  /** Roda ao clicar, além de fechar o aviso — ex.: abrir a modal de atualização. */
  onClick?: () => void;
}

/** Quanto tempo um aviso fica na tela, em ms. */
const DEFAULT_MS = 4200;

interface ToastState {
  toasts: Toast[];
  push(message: string, ms?: number, onClick?: () => void): void;
  dismiss(id: number): void;
}

let nextId = 1;

/**
 * Avisos curtos no topo. Empilham em vez de se substituírem — no 3.x um
 * aviso novo apagava o anterior, e mensagens importantes ("fulano começou a
 * transmitir") sumiam antes de serem lidas.
 */
export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],

  push(message, ms = DEFAULT_MS, onClick) {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, onClick }].slice(-4) });
    setTimeout(() => get().dismiss(id), ms);
  },

  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** Atalho para uso fora de componentes. `onClick` roda além de fechar o aviso. */
export const toast = (message: string, ms?: number, onClick?: () => void): void =>
  useToasts.getState().push(message, ms, onClick);
