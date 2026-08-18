import { create } from 'zustand';
import { storage, KEYS } from '@/lib/storage';
import type { PublicUser, SessionPayload } from '@/types/api';

/** Onde o app está no caminho entre "abriu" e "logado". */
export type Phase = 'booting' | 'gate' | 'ready';

interface SessionState {
  phase: Phase;
  me: PublicUser | null;
  friends: Set<string>;
  /** `false` enquanto o socket está caído — a interface mostra "reconectando". */
  connected: boolean;
  /** Sala a retomar depois de uma reconexão. */
  rejoin: { guildId: string; channelId: string } | null;

  setPhase(phase: Phase): void;
  setConnected(connected: boolean): void;
  setRejoin(room: { guildId: string; channelId: string } | null): void;
  adopt(payload: SessionPayload): void;
  setMe(user: PublicUser): void;
  setFriends(friends: string[]): void;
  logout(): void;
}

/**
 * Quem eu sou e se estou conectado.
 *
 * O perfil e a lista de amigos são espelhados no localStorage para que a
 * interface apareça preenchida no próximo boot antes mesmo do socket
 * responder — é a diferença entre abrir o app e ver uma tela pronta ou uma
 * tela cinza por dois segundos.
 */
export const useSession = create<SessionState>()((set) => ({
  phase: 'booting',
  me: storage.get<PublicUser | null>(KEYS.profileCache, null),
  friends: new Set(storage.get<string[]>(KEYS.friendsCache, [])),
  connected: false,
  rejoin: null,

  setPhase: (phase) => set({ phase }),
  setConnected: (connected) => set({ connected }),
  setRejoin: (rejoin) => set({ rejoin }),

  adopt(payload) {
    storage.set(KEYS.userId, payload.user.id);
    storage.set(KEYS.authToken, payload.token);
    storage.set(KEYS.name, payload.user.name);
    storage.set(KEYS.profileCache, payload.user);
    storage.set(KEYS.friendsCache, payload.friends);
    set({
      me: payload.user,
      friends: new Set(payload.friends),
      phase: 'ready',
      connected: true,
    });
  },

  setMe(user) {
    storage.set(KEYS.profileCache, user);
    storage.set(KEYS.name, user.name);
    set({ me: user });
  },

  setFriends(friends) {
    storage.set(KEYS.friendsCache, friends);
    set({ friends: new Set(friends) });
  },

  /** Sai só desta conta — tema e preferências continuam. */
  logout() {
    for (const key of [KEYS.userId, KEYS.authToken, KEYS.guildsCache, KEYS.profileCache]) {
      storage.remove(key);
    }
    window.location.reload();
  },
}));

/** Conta anônima de antes do login existir: tem userId salvo, mas nenhum token. */
export function legacyUserId(): string | null {
  return storage.get<string | null>(KEYS.authToken, null)
    ? null
    : storage.get<string | null>(KEYS.userId, null);
}

export function savedCredentials(): { userId: string; token: string } | null {
  const userId = storage.get<string | null>(KEYS.userId, null);
  const token = storage.get<string | null>(KEYS.authToken, null);
  return userId && token ? { userId, token } : null;
}
