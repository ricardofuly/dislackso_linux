import { useEffect } from 'react';
import { annot } from '@/lib/annot/engine';
import { voice } from '@/lib/rtc/engine';
import { useRoom } from '@/stores/room';
import { settings } from '@/stores/settings';
import { toggleScreen } from '@/features/voice/actions';
import { shortcutMatches } from '@/lib/format';

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
 * Os atalhos globais configuráveis:
 * - Mutar/Desmutar microfone (muteKey, padrão KeyM)
 * - Iniciar/Parar transmissão de tela (screenKey, padrão KeyS)
 * - Apertar para falar (pttKey, padrão Space)
 * - Ativar/Desativar anotações (annotKey, padrão KeyP)
 * - Abrir configurações (Ctrl+, / Cmd+,)
 * - Voltar / Cancelar (Escape)
 */
export function useKeyboardShortcuts({ onOpenSettings }: Options): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = settings();

      if (e.repeat) {
        if (!isTyping(e.target) && shortcutMatches(e, s.pttKey)) e.preventDefault();
        return;
      }
      if (isTyping(e.target)) return;

      const inRoom = Boolean(useRoom.getState().room);

      if (e.key === 'Escape') {
        if (annot.active) return annot.setActive(null);
        if (useRoom.getState().focusId) return useRoom.getState().focus(null);
        return;
      }

      if ((e.key === ',' || e.code === 'Comma') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onOpenSettings();
        return;
      }

      if (inRoom && s.micMode === 'ptt' && shortcutMatches(e, s.pttKey)) {
        e.preventDefault();
        voice.mic.setPtt(true);
        return;
      }

      if (!inRoom) return;

      if (shortcutMatches(e, s.muteKey)) {
        e.preventDefault();
        voice.toggleMic();
        return;
      }

      if (shortcutMatches(e, s.screenKey)) {
        e.preventDefault();
        toggleScreen();
        return;
      }

      if (shortcutMatches(e, s.annotKey)) {
        e.preventDefault();
        const target = useRoom.getState().focusId;
        if (target) annot.setActive(annot.isActive(target) ? null : target);
        return;
      }
    };

    const up = (e: KeyboardEvent) => {
      if (shortcutMatches(e, settings().pttKey)) {
        voice.mic.setPtt(false);
      }
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
