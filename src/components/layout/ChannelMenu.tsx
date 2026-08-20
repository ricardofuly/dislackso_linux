import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { RightClickMenu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { deleteChannel } from '@/features/guilds/actions';
import type { Channel } from '@/types/api';

interface ChannelMenuProps {
  guildId: string;
  channel: Channel;
  children: ReactNode;
}

/**
 * Botão direito num canal: só "excluir", por enquanto.
 *
 * Fica aberto pra qualquer membro clicar — quem não é dono (ou admin do app)
 * simplesmente recebe o erro do servidor num aviso, em vez de um botão
 * cinza escondendo a opção. O servidor é a única fonte de verdade sobre quem
 * pode apagar o quê.
 */
export function ChannelMenu({ guildId, channel, children }: ChannelMenuProps) {
  const [confirm, setConfirm] = useState(false);
  const isVoice = channel.type !== 'text';
  const label = isVoice ? 'Excluir sala' : 'Excluir canal';

  return (
    <>
      <RightClickMenu
        actions={[
          { id: 'delete', label, icon: <Trash2 size={16} />, danger: true, onSelect: () => setConfirm(true) },
        ]}
      >
        {children}
      </RightClickMenu>

      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title={label}
        description={`Isso apaga #${channel.name} para todos os membros. Não dá para desfazer.`}
        confirmLabel="Excluir"
        danger
        onConfirm={() => void deleteChannel(guildId, channel.id)}
      />
    </>
  );
}
