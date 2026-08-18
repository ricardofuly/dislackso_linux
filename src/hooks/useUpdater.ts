import { useCallback, useEffect, useState } from 'react';
import { desktop, isDesktop, type UpdateState } from '@/lib/platform';
import { settings } from '@/stores/settings';
import { toast } from '@/stores/toasts';

const IDLE: UpdateState = {
  status: 'idle',
  info: null,
  progress: null,
  error: null,
  can: false,
  reason: null,
  current: '',
};

/** Espera o app assentar antes de bater no GitHub — o boot já tem o que fazer. */
const AUTO_CHECK_DELAY_MS = 6000;

/**
 * O estado do atualizador do app instalado.
 *
 * O processo principal é a fonte da verdade e empurra cada mudança; aqui só
 * espelhamos. No navegador tudo fica em `idle` com `can: false`.
 */
export function useUpdater() {
  const [state, setState] = useState<UpdateState>(IDLE);

  useEffect(() => {
    const bridge = desktop();
    if (!bridge) return;

    bridge.update.onChange(setState);
    void bridge.update.state().then(setState);
  }, []);

  const check = useCallback(async () => {
    const next = await desktop()?.update.check();
    if (next) setState(next);
  }, []);

  const download = useCallback(async () => {
    const next = await desktop()?.update.download();
    if (next) setState(next);
  }, []);

  const install = useCallback(() => desktop()?.update.install(), []);

  return { state, check, download, install };
}

/**
 * Verificação automática ao abrir, se a pessoa não desligou.
 *
 * Só avisa: nada é baixado sozinho. Baixar dezenas de megabytes no meio de
 * uma chamada é pior do que esperar o usuário decidir.
 */
export function useAutoUpdateCheck(): void {
  useEffect(() => {
    if (!isDesktop() || !settings().autoUpdate) return;

    const timer = setTimeout(() => {
      void desktop()
        ?.update.check()
        .then((state) => {
          if (state?.status === 'available' && state.info) {
            toast(`Versão ${state.info.version} disponível — abra Configurações › Atualizações.`, 7000);
          }
        })
        .catch(() => {
          /* sem internet no boot não é motivo para incomodar o usuário */
        });
    }, AUTO_CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);
}
