import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { assetUrl } from '@/lib/env';
import { initials } from '@/lib/format';
import { pickImage, uploadImage } from '@/features/profile/actions';
import { updateGuild } from '@/features/guilds/actions';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toasts';
import type { Guild } from '@/types/api';

/** Limite do ícone de servidor: menor que o de avatar, porque ele aparece em 46px. */
const MAX_ICON_BYTES = 8 * 1024 * 1024;

/**
 * Nome e ícone do servidor. Só o dono edita; os outros veem em modo leitura,
 * o que é mais útil que esconder a opção (todo mundo quer conferir o nome).
 */
export function ServerSettingsDialog({ guild, onClose }: { guild: Guild | null; onClose(): void }) {
  const me = useSession((s) => s.me);
  const isOwner = Boolean(guild && me?.id === guild.ownerId);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  // Reabrir o diálogo tem de mostrar o que está salvo agora, não o rascunho
  // que ficou da última vez.
  useEffect(() => {
    if (!guild) return;
    setName(guild.name);
    setIcon(guild.icon ?? '');
  }, [guild]);

  const changeIcon = async () => {
    const dataUrl = await pickImage(MAX_ICON_BYTES);
    if (!dataUrl || !me) return;
    try {
      setIcon(await uploadImage(dataUrl, 'guild', me.id));
    } catch (err) {
      toast(`Falha ao enviar: ${(err as Error).message}`);
    }
  };

  const save = async () => {
    if (!guild) return;
    if (!name.trim()) {
      toast('Dê um nome ao servidor.');
      return false;
    }
    await updateGuild(guild.id, {
      ...(name.trim() !== guild.name ? { name: name.trim() } : {}),
      ...(icon !== (guild.icon ?? '') ? { icon } : {}),
    });
  };

  return (
    <Modal
      open={Boolean(guild)}
      onOpenChange={(next) => !next && onClose()}
      title="Configurações do servidor"
      confirmLabel="Salvar"
      cancelLabel={isOwner ? 'Cancelar' : 'Fechar'}
      hideConfirm={!isOwner}
      onConfirm={save}
    >
      <Field label="Ícone do servidor">
        {() => (
          <div className="flex items-center gap-3">
            <div
              className="grid size-16 place-items-center overflow-hidden rounded-[var(--radius-md)]
                         bg-accent text-lg font-semibold text-accent-fg"
              style={icon ? { backgroundImage: `url('${assetUrl(icon)}')`, backgroundSize: 'cover' } : undefined}
            >
              {!icon && initials(guild?.name)}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button variant="primary" size="sm" disabled={!isOwner} onClick={() => void changeIcon()}>
                Alterar imagem
              </Button>
              {icon && (
                <Button variant="ghost" size="sm" disabled={!isOwner} onClick={() => setIcon('')}>
                  Remover
                </Button>
              )}
            </div>
          </div>
        )}
      </Field>

      <Field label="Nome do servidor">
        {(id) => (
          <TextInput
            id={id}
            value={name}
            maxLength={48}
            disabled={!isOwner}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>

      {!isOwner && (
        <p className="text-[12px] text-dim">
          Somente o dono do servidor pode alterar essas configurações.
        </p>
      )}
    </Modal>
  );
}
