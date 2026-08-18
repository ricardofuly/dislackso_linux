import { create } from 'zustand';
import { feedback } from '@/lib/feedback';
import { desktop, isDesktop } from '@/lib/platform';
import type { AdminAnnouncement } from '@/types/api';

interface AnnouncementState {
  queue: AdminAnnouncement[];
  enqueue(payload: AdminAnnouncement): void;
  dismiss(): void;
}

/**
 * Avisos do painel de desenvolvedor — um por vez, na ordem em que chegaram.
 *
 * A fila existe porque um aviso pode chegar enquanto outro está na tela, e
 * sobrescrever o primeiro faria a mensagem anterior nunca ser lida.
 */
export const useAnnouncements = create<AnnouncementState>()((set, get) => ({
  queue: [],

  enqueue(payload) {
    if (get().queue.some((p) => p.id === payload.id)) return;
    set({ queue: [...get().queue, payload] });
    feedback('announce');
    if (payload.forceFocus && isDesktop()) void desktop()?.focusWindow();
  },

  dismiss() {
    set({ queue: get().queue.slice(1) });
  },
}));
