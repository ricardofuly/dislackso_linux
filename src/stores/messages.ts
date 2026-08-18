import { create } from 'zustand';
import type { ChatMessage } from '@/types/api';

/** Quantas mensagens guardamos em memória por canal. */
const KEEP = 200;

export const messageKey = (guildId: string, channelId: string): string => `${guildId}/${channelId}`;

interface MessagesState {
  /** `guildId/channelId` → mensagens já carregadas, da mais antiga à mais nova. */
  byChannel: Map<string, ChatMessage[]>;
  /** Canais com mensagem nova que eu ainda não abri. */
  unread: Set<string>;

  load(guildId: string, channelId: string, messages: ChatMessage[]): void;
  append(guildId: string, channelId: string, message: ChatMessage): void;
  markRead(guildId: string, channelId: string): void;
}

export const useMessages = create<MessagesState>()((set, get) => ({
  byChannel: new Map(),
  unread: new Set(),

  load(guildId, channelId, messages) {
    const byChannel = new Map(get().byChannel);
    byChannel.set(messageKey(guildId, channelId), messages);
    set({ byChannel });
  },

  append(guildId, channelId, message) {
    const key = messageKey(guildId, channelId);
    const list = get().byChannel.get(key) ?? [];
    // O servidor também devolve a mensagem no ack de quem enviou; sem esta
    // checagem ela apareceria duas vezes para o próprio autor.
    if (list.some((m) => m.id === message.id)) return;

    const byChannel = new Map(get().byChannel);
    byChannel.set(key, [...list, message].slice(-KEEP));
    set({ byChannel });
  },

  markRead(guildId, channelId) {
    const unread = new Set(get().unread);
    unread.delete(messageKey(guildId, channelId));
    set({ unread });
  },
}));
