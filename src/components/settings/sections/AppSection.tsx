import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SettingRow } from '../SettingRow';
import { serverUrl } from '@/lib/env';
import { desktop, type DesktopInfo } from '@/lib/platform';

/** Onde esta instalação está apontando e onde ela guarda os dados. */
export function AppSection() {
  const [info, setInfo] = useState<DesktopInfo | null>(null);

  useEffect(() => {
    void desktop()?.info().then(setInfo);
  }, []);

  return (
    <>
      <SettingRow title="Servidor" desc="Situação atual desta instalação." stack>
        <pre className="selectable rounded-[var(--radius-sm)] bg-field p-3 font-mono text-[12px] text-text">
          {`Servidor : ${serverUrl() || 'endereço padrão'}\nDados em : ${info?.dataDir ?? '…'}`}
        </pre>
      </SettingRow>

      <SettingRow
        title="Recarregar"
        desc="Recarrega a interface — útil depois de trocar o servidor no painel de desenvolvedor."
      >
        <Button onClick={() => void desktop()?.goHome()}>
          <RefreshCw size={16} /> Recarregar o app
        </Button>
      </SettingRow>
    </>
  );
}
