import { useEffect } from 'react';
import { voice } from '@/lib/rtc/engine';
import { annot } from '@/lib/annot/engine';
import { feedback } from '@/lib/feedback';
import { useRoom } from '@/stores/room';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toasts';

/**
 * Traduz os eventos do motor de mídia em atualizações de store.
 *
 * O motor não é reativo (e nem deveria ser). Este hook é a única ponte entre
 * ele e o React: cada evento vira um `bump()`, que faz quem lê o motor
 * repintar. Um lugar só, montado uma vez.
 */
export function useEngineBridge(): void {
  useEffect(() => {
    const bump = () => useRoom.getState().bump();

    const offs = [
      voice.on('peerschange', bump),
      voice.on('peerchange', bump),
      voice.on('localchange', bump),
      voice.on('qualitydowngraded', bump),
      voice.on('notice', (message) => toast(message, 6000)),

      voice.on('screenstart', () => {
        const { autoFocus, selfPreview } = useSettings.getState();
        if (autoFocus && selfPreview) useRoom.getState().focus('local');
        toast('Você começou a transmitir sua tela.');
        feedback('screenstart');
        bump();
      }),

      voice.on('screenstop', () => {
        if (useRoom.getState().focusId === 'local') useRoom.getState().focus(null);
        annot.setActive(null);
        toast('Você parou de transmitir.');
        feedback('screenstop');
        bump();
      }),
    ];

    // A barrinha de rabisco também precisa repintar quando a ferramenta muda.
    annot.onChange = bump;

    return () => {
      for (const off of offs) off();
      annot.onChange = null;
    };
  }, []);
}

/**
 * O estado da conexão de cada par muda sem disparar evento nenhum. Um
 * refresco leve mantém o "conectando…" dos tiles honesto.
 */
export function useConnectionRefresh(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => useRoom.getState().bump(), 2000);
    return () => clearInterval(timer);
  }, [active]);
}
