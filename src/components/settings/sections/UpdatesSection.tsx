import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { SettingNote, SettingRow } from '../SettingRow';
import { UpdateCheckModal } from '../UpdateCheckModal';
import { useUpdater } from '@/hooks/useUpdater';
import { desktop } from '@/lib/platform';
import { useSettings } from '@/stores/settings';

const REPO_URL = 'https://github.com/spikeleez/dislackso';

/**
 * Atualizações do app instalado.
 *
 * Nada é baixado sem o usuário mandar — a verificação automática só avisa. É
 * uma escolha deliberada: baixar 80 MB no meio de uma chamada é pior do que
 * esperar a pessoa decidir. "Procurar atualizações" abre uma janela própria
 * (`UpdateCheckModal`) com todo o processo — checar, baixar, reiniciar.
 */
export function UpdatesSection() {
  const { state } = useUpdater();
  const autoUpdate = useSettings((s) => s.autoUpdate);
  const set = useSettings((s) => s.set);
  const [checking, setChecking] = useState(false);

  return (
    <>
      <SettingRow
        title={`Versão instalada: ${state.current || '—'}`}
        desc="De onde vêm as atualizações: releases do repositório no GitHub."
      >
        <Button
          onClick={() => void desktop()?.openExternal(`${REPO_URL}/releases/tag/v${state.current}`)}
          disabled={!state.current}
        >
          <ExternalLink size={16} /> Notas desta versão
        </Button>
      </SettingRow>

      <SettingRow title="Ação" desc="Verificar, baixar e instalar — tudo numa janela só.">
        <Button variant="primary" disabled={!state.can} onClick={() => setChecking(true)}>
          <RefreshCw size={16} /> Procurar atualizações
        </Button>
      </SettingRow>

      <SettingRow
        title="Procurar ao abrir o app"
        desc="Consulta o GitHub alguns segundos depois de iniciar. Nada é baixado sem você mandar."
      >
        <Toggle
          label="Procurar ao abrir o app"
          checked={autoUpdate}
          onChange={(value) => set('autoUpdate', value)}
        />
      </SettingRow>

      <SettingRow title="Histórico" desc="A lista completa de versões e o que mudou em cada uma.">
        <Button onClick={() => void desktop()?.openExternal(`${REPO_URL}/releases`)}>
          <ExternalLink size={16} /> Ver todas as versões
        </Button>
      </SettingRow>

      <SettingNote>
        A atualização baixa só os pedaços que mudaram desde a sua versão, então costuma ser bem
        menor que o instalador inteiro. Ao terminar de baixar, o app reinicia e instala sozinho.
      </SettingNote>

      <UpdateCheckModal open={checking} onClose={() => setChecking(false)} />
    </>
  );
}
