import { useEffect, useState } from 'react';
import { setServerUrlOverride } from '@/lib/env';
import { desktop, isDesktop } from '@/lib/platform';

/**
 * No app desktop, o painel de desenvolvedor pode apontar o app para outro
 * servidor (testes). Isso precisa ser resolvido *antes* de abrir o socket,
 * senão a primeira conexão vai para o endereço errado.
 *
 * Devolve `true` quando dá para conectar. No navegador é imediato.
 */
export function useDesktopServerOverride(): boolean {
  const [ready, setReady] = useState(!isDesktop());

  useEffect(() => {
    if (ready) return;
    desktop()
      ?.info()
      .then((info) => {
        if (info?.serverUrlOverride) setServerUrlOverride(info.serverUrlOverride);
      })
      .catch((err: Error) => console.warn('[boot] info do desktop:', err.message))
      .finally(() => setReady(true));
  }, [ready]);

  return ready;
}
