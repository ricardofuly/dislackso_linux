import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { createGuild, inviteLink, joinGuild, parseInvite } from '@/features/guilds/actions';
import { toast } from '@/stores/toasts';
import type { Guild } from '@/types/api';

interface DialogProps {
  open: boolean;
  onClose(): void;
}

export function CreateGuildDialog({ open, onClose }: DialogProps) {
  const [name, setName] = useState('');
  const [created, setCreated] = useState<Guild | null>(null);

  const confirm = async () => {
    if (!name.trim()) {
      toast('Dê um nome ao servidor.');
      return false;
    }
    const guild = await createGuild(name.trim());
    if (!guild) return false;
    setName('');
    // Criar sem o convite à mão não serve para nada — o servidor nasce vazio.
    setCreated(guild);
  };

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => !next && onClose()}
        title="Criar servidor"
        description="Servidores são privados. Só entra quem receber seu convite."
        confirmLabel="Criar"
        onConfirm={confirm}
      >
        <Field label="Nome do servidor">
          {(id) => (
            <TextInput
              id={id}
              value={name}
              maxLength={48}
              autoFocus
              placeholder="Ex: Turma do LoL"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
      </Modal>

      <InviteDialog guild={created} onClose={() => setCreated(null)} />
    </>
  );
}

export function JoinGuildDialog({ open, onClose }: DialogProps) {
  const [raw, setRaw] = useState('');

  const confirm = async () => {
    const code = parseInvite(raw);
    if (!code) {
      toast('Informe o convite.');
      return false;
    }
    const guild = await joinGuild(code);
    if (!guild) return false;
    setRaw('');
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Entrar com convite"
      description="Cole o código ou o link que seu amigo enviou."
      confirmLabel="Entrar"
      onConfirm={confirm}
    >
      <Field label="Convite">
        {(id) => (
          <TextInput
            id={id}
            value={raw}
            autoFocus
            placeholder="ABCD2345 ou https://…#invite=ABCD2345"
            onChange={(e) => setRaw(e.target.value)}
          />
        )}
      </Field>
    </Modal>
  );
}

/**
 * O convite, pronto para copiar.
 *
 * Mostra link e código separados: o link é o caminho de uma tapada, e o
 * código é o que se manda por voz ou por um chat que come URLs.
 */
export function InviteDialog({ guild, onClose }: { guild: Guild | null; onClose(): void }) {
  const link = guild ? inviteLink(guild.invite) : '';

  const copy = (text: string, message: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast(message))
      .catch(() => toast(`Copie manualmente: ${text}`, 8000));
  };

  return (
    <Modal
      open={Boolean(guild)}
      onOpenChange={(next) => !next && onClose()}
      title="Convidar amigos"
      description={guild ? `Qualquer pessoa com este link entra em ${guild.name}.` : ''}
      confirmLabel="Copiar link"
      onConfirm={() => copy(link, 'Link copiado!')}
    >
      <Field label="Link de convite">
        {(id) => <TextInput id={id} readOnly value={link} onFocus={(e) => e.target.select()} />}
      </Field>

      <Field label="Código">
        {(id) => (
          <div className="flex gap-2">
            <TextInput
              id={id}
              readOnly
              value={guild?.invite ?? ''}
              className="font-mono tracking-widest"
              onFocus={(e) => e.target.select()}
            />
            <Button onClick={() => copy(guild?.invite ?? '', 'Código copiado!')}>Copiar</Button>
          </div>
        )}
      </Field>
    </Modal>
  );
}
