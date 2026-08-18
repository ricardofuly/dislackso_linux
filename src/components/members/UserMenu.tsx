import { useState, type ReactNode } from 'react';
import { Star, StarOff, User, UserPlus, Volume1, Volume2, VolumeX } from 'lucide-react';
import { RightClickMenu, type MenuAction } from '@/components/ui/Menu';
import { ProfileDialog } from '@/components/overlays/ProfileDialog';
import { toggleFriend } from '@/features/guilds/actions';
import { useRoom } from '@/stores/room';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toasts';
import type { PublicUser } from '@/types/api';

interface UserMenuProps {
  user: PublicUser;
  /** Presente quando a pessoa está na mesma sala de voz que eu. */
  sid?: string;
  children: ReactNode;
}

/**
 * Botão direito num usuário.
 *
 * As opções de áudio (mutar, volume) valem **só para mim** — não afetam o que
 * os outros ouvem. Por isso só aparecem para quem está na mesma sala de voz:
 * fora dela não há áudio nenhum para ajustar.
 */
export function UserMenu({ user, sid, children }: UserMenuProps) {
  const me = useSession((s) => s.me);
  const friends = useSession((s) => s.friends);
  const localMutes = useRoom((s) => s.localMutes);
  const [profile, setProfile] = useState(false);

  const isMe = me?.id === user.id;
  const isFriend = friends.has(user.id);
  const muted = Boolean(sid && localMutes.has(sid));

  const actions: MenuAction[] = [];

  if (sid && !isMe) {
    actions.push(
      {
        id: 'mute',
        label: muted ? 'Desmutar' : 'Mutar só pra mim',
        icon: muted ? <Volume2 size={16} /> : <VolumeX size={16} />,
        onSelect: () => useRoom.getState().toggleMute(sid),
      },
      {
        id: 'vol-down',
        label: 'Diminuir volume',
        icon: <Volume1 size={16} />,
        onSelect: () => bumpVolume(sid, -0.2),
      },
      {
        id: 'vol-up',
        label: 'Aumentar volume',
        icon: <Volume2 size={16} />,
        onSelect: () => bumpVolume(sid, 0.2),
      },
    );
  }

  if (!isMe) {
    actions.push({
      id: 'friend',
      label: isFriend ? 'Remover dos amigos' : 'Adicionar como amigo',
      icon: isFriend ? <StarOff size={16} /> : <UserPlus size={16} />,
      separatorBefore: actions.length > 0,
      onSelect: () => void toggleFriend(user.id, !isFriend),
    });
  }

  actions.push({
    id: 'profile',
    label: 'Ver perfil',
    icon: <User size={16} />,
    separatorBefore: actions.length > 0,
    onSelect: () => setProfile(true),
  });

  return (
    <>
      <RightClickMenu actions={actions}>{children}</RightClickMenu>
      <ProfileDialog user={profile ? user : null} onClose={() => setProfile(false)} />
    </>
  );
}

function bumpVolume(sid: string, delta: number): void {
  const next = useRoom.getState().bumpVolume(sid, delta);
  toast(`Volume de quem tá falando: ${Math.round(next * 100)}%`);
}
