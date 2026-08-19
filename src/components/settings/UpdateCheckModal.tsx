import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RotateCw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useUpdater } from '@/hooks/useUpdater';
import { bytes } from '@/lib/format';
import type { UpdateState } from '@/lib/platform';

interface UpdateCheckModalProps {
  open: boolean;
  onClose(): void;
}

/**
 * A janelinha de "procurar atualizações" — checa, mostra o que achou, baixa
 * e reinicia sozinha quando terminar. Existe porque a versão anterior desse
 * fluxo só empurrava a pessoa pra rolar a tela de Configurações até achar o
 * que estava acontecendo; aqui fica tudo visível no mesmo lugar que abriu.
 */
export function UpdateCheckModal({ open, onClose }: UpdateCheckModalProps) {
  const { state, check, download, install } = useUpdater();

  useEffect(() => {
    if (open) void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Terminou de baixar: instala e reinicia sozinho, sem esperar mais um clique.
  useEffect(() => {
    if (state.status === 'ready') install();
  }, [state.status, install]);

  const canAct = state.status === 'available' || state.status === 'error';

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Procurar atualizações"
      cancelLabel="Fechar"
      confirmLabel={state.status === 'error' ? 'Tentar de novo' : 'Atualizar agora'}
      hideConfirm={!canAct}
      onConfirm={() => {
        if (state.status === 'error') void check();
        else void download();
        return false;
      }}
    >
      <UpdateBody state={state} />
    </Modal>
  );
}

function UpdateBody({ state }: { state: UpdateState }) {
  if (!state.can) {
    return (
      <Row icon={<AlertTriangle size={20} className="text-yellow" />}>
        {state.reason === 'portable'
          ? 'Versão portátil — atualize baixando a nova pasta.'
          : 'Rodando a partir do código-fonte: sem atualização automática.'}
      </Row>
    );
  }

  switch (state.status) {
    case 'checking':
      return (
        <Row icon={<Loader2 size={20} className="animate-spin text-dim" />}>Procurando novidades…</Row>
      );
    case 'available':
      return (
        <Row icon={<Download size={20} className="text-accent" />}>
          Versão {state.info?.version} disponível.
        </Row>
      );
    case 'downloading':
      return (
        <div className="space-y-2">
          <Row icon={<Loader2 size={20} className="animate-spin text-accent" />}>Baixando a atualização…</Row>
          {state.progress && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-bg-4">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${state.progress.percent}%` }}
                />
              </div>
              <p className="text-[12px] text-dim">
                {bytes(state.progress.transferred)} de {bytes(state.progress.total)} · {bytes(state.progress.speed)}/s
              </p>
            </div>
          )}
        </div>
      );
    case 'ready':
      return (
        <Row icon={<RotateCw size={20} className="animate-spin text-green" />}>
          Baixado — reiniciando pra instalar…
        </Row>
      );
    case 'current':
      return (
        <Row icon={<CheckCircle2 size={20} className="text-green" />}>Você já está na versão mais recente.</Row>
      );
    case 'error':
      return <Row icon={<AlertTriangle size={20} className="text-red" />}>{state.error ?? 'Falha ao verificar.'}</Row>;
    default:
      return <Row icon={<Loader2 size={20} className="text-dim" />}>Nunca verificado nesta sessão.</Row>;
  }
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-bg-1/60 p-3 text-[14px] text-text">
      {icon}
      <span>{children}</span>
    </div>
  );
}
