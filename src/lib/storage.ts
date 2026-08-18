/**
 * Preferências e sessão no localStorage.
 *
 * O prefixo é `dsx:`. A versão anterior do app se chamava Discord2 e usava
 * `d2:` — renomear sem migrar deslogaria todo mundo e apagaria servidores
 * salvos, então a migração acontece uma vez, no primeiro boot.
 *
 * As chaves estão congeladas em docs/CONTRATO.md. Não renomeie nenhuma.
 */

const PREFIX = 'dsx:';
const LEGACY_PREFIX = 'd2:';

function migrateLegacy(): void {
  try {
    if (localStorage.getItem(PREFIX + 'migrated')) return;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LEGACY_PREFIX)) continue;
      const next = PREFIX + key.slice(LEGACY_PREFIX.length);
      const value = localStorage.getItem(key);
      if (value !== null && localStorage.getItem(next) === null) {
        localStorage.setItem(next, value);
      }
    }
    localStorage.setItem(PREFIX + 'migrated', '1');
  } catch {
    /* modo privado sem storage: segue sem migrar */
  }
}

migrateLegacy();

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },

  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* cota estourada ou modo privado: preferência não persiste, app segue */
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* idem */
    }
  },
};

/** As chaves que o app usa, num lugar só, para ninguém escrever string solta. */
export const KEYS = {
  userId: 'userId',
  authToken: 'authToken',
  name: 'name',
  settings: 'settings',
  guildsCache: 'guildsCache',
  profileCache: 'profileCache',
  friendsCache: 'friendsCache',
  membersOpen: 'membersOpen',
} as const;
