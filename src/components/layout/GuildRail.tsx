import { motion } from 'motion/react';
import { LogIn, Plus } from 'lucide-react';
import { Glass } from '@/components/ui/Glass';
import { Tip } from '@/components/ui/Tooltip';
import { assetUrl } from '@/lib/env';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';
import { countLive, useGuilds } from '@/stores/guilds';
import { useRoom } from '@/stores/room';
import { CreateGuildDialog, JoinGuildDialog } from '@/components/overlays/GuildDialogs';
import { useState } from 'react';
import type { Guild } from '@/types/api';

/**
 * A coluna de servidores.
 *
 * O indicador da esquerda é uma barrinha única que desliza entre os ícones
 * (`layoutId`), em vez de uma por servidor aparecendo e sumindo — é o que dá
 * a sensação de continuidade ao trocar de servidor.
 */
export function GuildRail() {
  const guilds = useGuilds((s) => s.guilds);
  const activeGuildId = useGuilds((s) => s.activeGuildId);
  const presence = useGuilds((s) => s.presence);
  const openGuild = useGuilds((s) => s.openGuild);

  const [dialog, setDialog] = useState<'create' | 'join' | null>(null);

  return (
    <Glass as="nav" variant="panel" className="flex w-17 shrink-0 flex-col items-center gap-2 py-3">
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
        {guilds.map((guild) => (
          <GuildButton
            key={guild.id}
            guild={guild}
            active={guild.id === activeGuildId}
            live={countLive(guild.id, presence)}
            onClick={() => openGuild(guild.id)}
          />
        ))}
      </div>

      <div className="h-px w-8 bg-line" />

      <Tip label="Criar servidor" side="right">
        <RailAction onClick={() => setDialog('create')} aria-label="Criar servidor">
          <Plus size={22} />
        </RailAction>
      </Tip>

      <Tip label="Entrar com convite" side="right">
        <RailAction onClick={() => setDialog('join')} aria-label="Entrar com convite">
          <LogIn size={20} />
        </RailAction>
      </Tip>

      <CreateGuildDialog open={dialog === 'create'} onClose={() => setDialog(null)} />
      <JoinGuildDialog open={dialog === 'join'} onClose={() => setDialog(null)} />
    </Glass>
  );
}

interface GuildButtonProps {
  guild: Guild;
  active: boolean;
  live: number;
  onClick(): void;
}

function GuildButton({ guild, active, live, onClick }: GuildButtonProps) {
  const inRoom = useRoom((s) => s.room?.guildId) === guild.id;

  return (
    <Tip label={guild.name} side="right">
      <motion.button
        type="button"
        onClick={onClick}
        layout
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn(
          'relative grid size-11.5 place-items-center overflow-hidden rounded-[var(--radius-md)]',
          'bg-bg-3 text-sm font-semibold text-bright',
          'transition-[border-radius,background-color] duration-(--duration-med) ease-(--ease-glass)',
          active ? 'rounded-[var(--radius-sm)] bg-accent text-accent-fg' : 'hover:rounded-[var(--radius-sm)]',
        )}
      >
        {active && (
          <motion.span
            layoutId="rail-marker"
            className="absolute -left-3 h-6 w-1 rounded-r-full bg-bright"
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          />
        )}

        {guild.icon ? (
          <img src={assetUrl(guild.icon)} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          initials(guild.name)
        )}

        {live > 0 && (
          <span
            className={cn(
              'absolute right-0.5 bottom-0.5 grid min-w-4 place-items-center rounded-full px-1',
              'text-[10px] font-bold text-white ring-2 ring-bg-2',
              inRoom ? 'bg-green' : 'bg-accent',
            )}
          >
            {live}
          </span>
        )}
      </motion.button>
    </Tip>
  );
}

function RailAction({ className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'grid size-11.5 place-items-center rounded-[var(--radius-md)] bg-bg-3 text-green',
        'transition-[border-radius,background-color,transform] duration-(--duration-med)',
        'ease-(--ease-glass) hover:rounded-[var(--radius-sm)] hover:bg-green hover:text-white',
        'active:scale-95',
        className,
      )}
      {...rest}
    />
  );
}
