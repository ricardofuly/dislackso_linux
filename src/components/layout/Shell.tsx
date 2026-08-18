import { useState } from 'react';
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
  const [settingsSection, setSettingsSection] = useState<string | null>(null);
  const inRoom = Boolean(useRoom((s) => s.room));

  useConnectionRefresh(inRoom);
  useKeyboardShortcuts({ onOpenSettings: () => setSettingsSection('conta') });

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
              animate={{ width: 232, opacity: 1 }}
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
