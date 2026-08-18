import { useEffect } from 'react';
import { desktop, isDesktop } from '@/lib/platform';
import { useScreenPicker } from '@/stores/screenPicker';

/**
 * Registra o app como o responsável por mostrar a modal de "o que
 * compartilhar", uma vez, no boot. Sem isto o Electron pede a escolha e
 * nunca recebe resposta — a captura de tela falha sempre.
 *
 * Só existe no desktop: no navegador o próprio sistema mostra o seletor
 * nativo e o Electron nem chega a chamar `onPickScreen`.
 */
export function useScreenPickerBridge(): void {
  useEffect(() => {
    if (!isDesktop()) return;
    desktop()!.onPickScreen((sources) => useScreenPicker.getState().request(sources));
  }, []);
}
