import { create } from 'zustand';

interface UpdateAnnounceState {
  open: boolean;
  show(): void;
  hide(): void;
}

/**
 * Ponte entre o aviso de versão nova (que chega fora do React, pelo socket
 * em `app/connection.ts`) e a modal que faz o download — clicar no aviso
 * chama `show()`, e quem renderiza `UpdateCheckModal` (em `App`) escuta daqui.
 */
export const useUpdateAnnounce = create<UpdateAnnounceState>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
