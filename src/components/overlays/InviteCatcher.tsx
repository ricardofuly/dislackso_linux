import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { joinGuild } from '@/features/guilds/actions';
import { useGuilds } from '@/stores/guilds';
import { useSession } from '@/stores/session';

/**
 * Convite que chegou pela URL (`…/#invite=ABCD2345`).
 *
 * Perguntamos antes de entrar em vez de entrar direto: um link colado num
 * grupo é clicado por gente que só queria ver do que se trata, e entrar
 * sozinho num servidor é uma ação com consequência social.
 */
export function InviteCatcher() {
  const phase = useSession((s) => s.phase);
  const guilds = useGuilds((s) => s.guilds);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'ready') return;

    const match = window.location.hash.match(/invite=([A-Z0-9]+)/i);
    if (!match?.[1]) return;

    const invite = match[1].toUpperCase();
    // Limpa a URL na hora: recarregar a página não deve reabrir o convite.
    window.history.replaceState(null, '', window.location.pathname);
    if (guilds.some((g) => g.invite === invite)) return;

    setCode(invite);
  }, [phase, guilds]);

  return (
    <Modal
      open={Boolean(code)}
      onOpenChange={(next) => !next && setCode(null)}
      title="Convite recebido"
      description="Você foi convidado para um servidor privado."
      confirmLabel="Entrar no servidor"
      onConfirm={async () => {
        if (code) await joinGuild(code);
        setCode(null);
      }}
    >
      <p className="font-mono text-lg tracking-widest text-bright">{code}</p>
    </Modal>
  );
}
