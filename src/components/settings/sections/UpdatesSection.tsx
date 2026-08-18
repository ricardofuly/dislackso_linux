import { Download, ExternalLink, RefreshCw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { SettingNote, SettingRow } from '../SettingRow';
import { useUpdater } from '@/hooks/useUpdater';
import { bytes } from '@/lib/format';
import { desktop } from '@/lib/platform';
import { useSettings } from '@/stores/settings';

const RELEASES_URL = 'https://github.com/spikeleez/dislackso/releases';

/**
 * Atualizações do app instalado.
 *
 * Nada é baixado sem o usuário mandar — a verificação automática só avisa. É
 * uma escolha deliberada: baixar 80 MB no meio de uma chamada é pior do que
 * esperar a pessoa decidir.
 */
export function UpdatesSection() {
  const { state, check, download, install } = useUpdater();
  const autoUpdate = useSettings((s) => s.autoUpdate);
  const set = useSettings((s) => s.set);

  return (
    <>
      <SettingRow
        title={`Versão instalada: ${state.current || '—'}`}
        desc="De onde vêm as atualizações: releases do repositório no GitHub."
        stack
      >
        <p className="text-[14px] text-text">{statusLabel(state)}</p>

        {state.status === 'downloading' && state.progress && (
          <div className="mt-2 space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-bg-4">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${state.progress.percent}%` }}
              />
            </div>
            <p className="text-[12px] text-dim">
              {bytes(state.progress.transferred)} de {bytes(state.progress.total)} ·{' '}
              {bytes(state.progress.speed)}/s
            </p>
          </div>
        )}

        {state.info?.notes && (
          <pre className="selectable mt-3 max-h-48 overflow-auto rounded-[var(--radius-sm)] bg-field
                          p-3 text-[12px] leading-relaxed whitespace-pre-wrap text-dim">
            {state.info.notes}
          </pre>
        )}
      </SettingRow>

      <SettingRow title="Ação" desc="Verificar, baixar ou instalar a atualização.">
        <div className="flex gap-2">
          {state.status === 'ready' ? (
            <Button variant="primary" onClick={() => void install()}>
              <RotateCw size={16} /> Reiniciar e instalar
            </Button>
          ) : state.status === 'available' ? (
            <Button variant="primary" onClick={() => void download()}>
              <Download size={16} /> Baixar atualização
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!state.can || state.status === 'checking' || state.status === 'downloading'}
              onClick={() => void check()}
            >
              <RefreshCw size={16} />
              {state.status === 'checking' ? 'Procurando…' : 'Procurar atualizações'}
            </Button>
          )}
        </div>
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
        <Button onClick={() => void desktop()?.openExternal(RELEASES_URL)}>
          <ExternalLink size={16} /> Ver todas as versões
        </Button>
      </SettingRow>

      <SettingNote>
        A atualização baixa só os pedaços que mudaram desde a sua versão, então costuma ser bem
        menor que o instalador inteiro. Para concluir, o app reinicia — ele pergunta antes e
        reabre sozinho.
      </SettingNote>
    </>
  );
}

function statusLabel(state: ReturnType<typeof useUpdater>['state']): string {
  if (!state.can) {
    return state.reason === 'portable'
      ? 'Versão portátil — atualize baixando a nova pasta.'
      : 'Rodando a partir do código-fonte.';
  }
  switch (state.status) {
    case 'checking':
      return 'Procurando…';
    case 'available':
      return `Versão ${state.info?.version} disponível`;
    case 'downloading':
      return 'Baixando…';
    case 'ready':
      return `Versão ${state.info?.version} pronta para instalar`;
    case 'current':
      return 'Você está na versão mais recente';
    case 'error':
      return state.error ?? 'Falha ao verificar';
    default:
      return 'Nunca verificado nesta sessão';
  }
}
