import { create } from 'zustand';
import { storage, KEYS } from '@/lib/storage';
import type { Guild, PeerInfo, Presence, PublicUser } from '@/types/api';

interface GuildsState {
  guilds: Guild[];
  activeGuildId: string | null;
  activeTextChannelId: string | null;
  /** guildId → canalId → quem está na sala de voz. */
  presence: Record<string, Presence>;
  /** guildId → quem está com o app aberto agora (não só em sala de voz). */
  online: Record<string, Set<string>>;

  setGuilds(guilds: Guild[]): void;
  upsert(guild: Guild): void;
  remove(guildId: string): void;
  openGuild(guildId: string): void;
  openTextChannel(guildId: string, channelId: string | null): void;
  setPresence(guildId: string, presence: Presence): void;
  setOnline(guildId: string, online: string[]): void;
  /** Reflete um perfil atualizado em todos os servidores que já temos. */
  refreshMember(user: PublicUser): void;
}

/**
 * Os servidores de que participo e quem está onde.
 *
 * `presence` e `online` chegam separados de propósito: presença é "está nesta
 * sala de voz agora" e muda várias vezes por minuto numa conversa; online é
 * "está com o app aberto" e muda raramente. Guardá-los juntos faria a lista
 * de membros repintar a cada vez que alguém abre e fecha o microfone.
 */
export const useGuilds = create<GuildsState>()((set, get) => ({
  guilds: storage.get<Guild[]>(KEYS.guildsCache, []),
  activeGuildId: null,
  activeTextChannelId: null,
  presence: {},
  online: {},

  setGuilds(guilds) {
    storage.set(KEYS.guildsCache, guilds);
    const active = get().activeGuildId ?? guilds[0]?.id ?? null;
    set({ guilds, activeGuildId: active });
  },

  upsert(guild) {
    const guilds = get().guilds.slice();
    const i = guilds.findIndex((g) => g.id === guild.id);
    if (i === -1) guilds.push(guild);
    else guilds[i] = guild;
    get().setGuilds(guilds);
  },

  remove(guildId) {
    const guilds = get().guilds.filter((g) => g.id !== guildId);
    storage.set(KEYS.guildsCache, guilds);
    set({
      guilds,
      activeGuildId: get().activeGuildId === guildId ? (guilds[0]?.id ?? null) : get().activeGuildId,
    });
  },

  openGuild(guildId) {
    set({ activeGuildId: guildId, activeTextChannelId: null });
  },

  openTextChannel(guildId, channelId) {
    set({ activeGuildId: guildId, activeTextChannelId: channelId });
  },

  setPresence(guildId, presence) {
    set({ presence: { ...get().presence, [guildId]: presence } });
  },

  setOnline(guildId, online) {
    set({ online: { ...get().online, [guildId]: new Set(online) } });
  },

  refreshMember(user) {
    const guilds = get().guilds.map((guild) => {
      const i = guild.members.findIndex((m) => m.id === user.id);
      if (i === -1) return guild;
      const members = guild.members.slice();
      members[i] = user;
      return { ...guild, members };
    });
    get().setGuilds(guilds);
  },
}));

/* ------------------------------------------------------------ seletores -- */

export function activeGuild(): Guild | null {
  const { guilds, activeGuildId } = useGuilds.getState();
  return guilds.find((g) => g.id === activeGuildId) ?? null;
}

/** Quantas pessoas estão em salas de voz de um servidor — o número no trilho. */
export function countLive(guildId: string, presence: Record<string, Presence>): number {
  return Object.values(presence[guildId] ?? {}).reduce((n, list) => n + list.length, 0);
}

export function occupantsOf(
  presence: Record<string, Presence>,
  guildId: string,
  channelId: string,
): PeerInfo[] {
  return presence[guildId]?.[channelId] ?? [];
}
