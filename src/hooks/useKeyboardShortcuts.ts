import { useEffect } from 'react';
import { annot } from '@/lib/annot/engine';
import { voice } from '@/lib/rtc/engine';
import { useRoom } from '@/stores/room';
import { settings } from '@/stores/settings';
import { toggleScreen } from '@/features/voice/actions';

interface Options {
  onOpenSettings(): void;
}

/** Atalhos digitados dentro de um campo pertencem ao campo, não ao app. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el?.matches?.('input, select, textarea') || el?.isContentEditable,
  );
}

/**
 * Os atalhos globais: M (microfone), S (tela), P (caneta), Esc (voltar).
 *
 * O apertar-para-falar é o caso delicado: `keydown` repete enquanto a tecla
 * fica pressionada, e sem barrar `e.repeat` o microfone abriria e fecharia
 * dezenas de vezes por segundo.
 */
export function useKeyboardShortcuts({ onOpenSettings }: Options): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const pttKey = settings().pttKey;

      if (e.repeat) {
        if (!isTyping(e.target) && e.code === pttKey) e.preventDefault();
        return;
      }
      if (isTyping(e.target)) return;

      const inRoom = Boolean(useRoom.getState().room);

      if (e.key === 'Escape') {
        if (annot.active) return annot.setActive(null);
        if (useRoom.getState().focusId) return useRoom.getState().focus(null);
        return;
      }

      if (inRoom && settings().micMode === 'ptt' && e.code === pttKey) {
        e.preventDefault();
        voice.mic.setPtt(true);
        return;
      }

      if (!inRoom) return;

      const key = e.key.toLowerCase();
      if (key === 'm') voice.toggleMic();
      if (key === 's') toggleScreen();
      if (key === 'p') {
        // Sem destaque, rabisca na tela que estiver disponível para isso.
        const target = useRoom.getState().focusId;
        if (target) annot.setActive(annot.isActive(target) ? null : target);
      }
      if (key === ',' && (e.ctrlKey || e.metaKey)) onOpenSettings();
    };

    const up = (e: KeyboardEvent) => {
      if (e.code === settings().pttKey) voice.mic.setPtt(false);
    };

    // Perder o foco com a tecla apertada tem de fechar o microfone — senão
    // ele fica aberto enquanto a pessoa está em outro programa.
    const blur = () => voice.mic.setPtt(false);
    const beforeUnload = () => {
      if (useRoom.getState().room) voice.stop();
    };

    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('beforeunload', beforeUnload);

    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [onOpenSettings]);
}
