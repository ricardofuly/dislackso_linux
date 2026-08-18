import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { storage, KEYS } from '@/lib/storage';
import { isDesktop } from '@/lib/platform';
import { GuildRail } from './GuildRail';
import { ChannelSidebar } from './ChannelSidebar';
import { TitleBar } from './TitleBar';
import { MembersPanel } from '@/components/members/MembersPanel';
import { Stage } from '@/components/stage/Stage';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useConnectionRefresh } from '@/app/useEngineBridge';
import { useRoom } from '@/stores/room';

/** Em janela estreita a coluna de membros encolhe antes de o palco sofrer. */
function useMembersWidth(): number {
  const [width, setWidth] = useState(() => (window.innerWidth < 1180 ? 184 : 232));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth < 1180 ? 184 : 232);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * O esqueleto do app: quatro colunas.
 *
 *   trilho de servidores │ canais │ palco │ membros
 *
 * As três primeiras são fixas; a de membros abre e fecha, e a escolha fica
 * salva. O palco é o único que cresce.
 */
export function Shell() {
  const [members, setMembers] = useState(() => storage.get(KEYS.membersOpen, true));
  const membersWidth = useMembersWidth();
  const [settingsSection, setSettingsSection] = useState<string | null>(null);
  const inRoom = Boolean(useRoom((s) => s.room));

  useConnectionRefresh(inRoom);
  // Estável de propósito: um objeto novo a cada render faria o efeito de
  // useKeyboardShortcuts (que depende dele) desligar e religar os atalhos
  // de teclado sempre que o Shell renderizar de novo.
  const openAccountSettings = useCallback(() => setSettingsSection('conta'), []);
  useKeyboardShortcuts({ onOpenSettings: openAccountSettings });

  const toggleMembers = () => {
    setMembers((open) => {
      storage.set(KEYS.membersOpen, !open);
      return !open;
    });
  };

  return (
    <div className="app-shell flex h-full flex-col bg-bg-0">
      {isDesktop() && <TitleBar />}

      <div className="flex min-h-0 flex-1 gap-1.5 p-1.5">
        <GuildRail />
        <ChannelSidebar onOpenSettings={setSettingsSection} />
        <Stage membersOpen={members} onToggleMembers={toggleMembers} onOpenSettings={setSettingsSection} />

        <AnimatePresence initial={false}>
          {members && (
            <motion.div
              key="members"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: membersWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              className="overflow-hidden"
            >
              <MembersPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SettingsDialog
        section={settingsSection}
        onNavigate={setSettingsSection}
        onClose={() => setSettingsSection(null)}
      />
    </div>
  );
}
