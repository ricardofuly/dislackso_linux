import { ask } from '@/lib/socket/client';
import { storage, KEYS } from '@/lib/storage';
import { legacyUserId } from '@/stores/session';
import { adoptSession } from '@/app/connection';

export type GateMode = 'login' | 'register';

/**
 * Entra ou cria conta.
 *
 * O caso do meio é o que exige cuidado: quem usava o app antes do login
 * existir tem um `userId` salvo mas nenhuma senha. Para essa pessoa,
 * "criar conta" na verdade *adota* a conta antiga (`auth:claim`), preservando
 * servidores e avatar. Se o id salvo não existir mais no servidor, aí sim
 * criamos uma conta nova — em vez de deixar o usuário preso num erro sem saída.
 */
export async function submitGate(
  mode: GateMode,
  username: string,
  password: string,
): Promise<void> {
  if (mode === 'login') {
    return adoptSession(await ask('auth:login', { username, password }));
  }

  const legacy = legacyUserId();
  if (!legacy) {
    return adoptSession(await ask('auth:register', { username, password, name: username }));
  }

  try {
    return adoptSession(await ask('auth:claim', { userId: legacy, username, password }));
  } catch (err) {
    if ((err as Error).message !== 'Conta não encontrada.') throw err;
    storage.remove(KEYS.userId);
    return adoptSession(await ask('auth:register', { username, password, name: username }));
  }
}

/** Sugestão de nickname a partir do último nome usado neste navegador. */
export function suggestedUsername(): string {
  return storage.get(KEYS.name, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
}
