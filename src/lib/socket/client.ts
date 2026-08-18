import { io, type Socket } from 'socket.io-client';
import { serverUrl } from '@/lib/env';
import type { ClientEvents, ServerEvents } from './events';

export type AppSocket = Socket<ServerEvents, ClientEvents>;

let socket: AppSocket | null = null;

/** Cria (uma vez) a conexão com o servidor. */
export function connectSocket(): AppSocket {
  socket ??= io(serverUrl(), { transports: ['websocket', 'polling'] });
  return socket;
}

export function getSocket(): AppSocket | null {
  return socket;
}

/** Só para o painel de dev, que pode trocar de servidor sem reiniciar o app. */
export function resetSocket(): void {
  socket?.close();
  socket = null;
}

/** Nomes de evento que esperam resposta — os únicos que `ask` aceita. */
type AskableEvent = {
  [K in keyof ClientEvents]: ClientEvents[K] extends (p: never, ack: never) => void ? K : never;
}[keyof ClientEvents];

type PayloadOf<K extends AskableEvent> = Parameters<ClientEvents[K]>[0];
type ResultOf<K extends AskableEvent> =
  Parameters<ClientEvents[K]>[1] extends (res: infer R) => void
    ? Exclude<R, { error: string }>
    : never;

/**
 * Chamada com resposta, em forma de Promise.
 *
 * O servidor responde `{ error }` em vez de rejeitar — a conversão para
 * exceção acontece aqui, num lugar só, para que a interface inteira possa
 * usar try/catch normal.
 */
export function ask<K extends AskableEvent>(
  event: K,
  payload: PayloadOf<K>,
): Promise<ResultOf<K>> {
  return new Promise((resolve, reject) => {
    const active = socket;
    if (!active) return reject(new Error('sem conexão'));

    const timer = setTimeout(() => reject(new Error('o servidor demorou demais para responder')), 20_000);

    // O socket.io tipado não consegue provar a relação payload↔ack neste
    // ponto genérico; o `ask` acima é que garante o par correto.
    (active.emit as (e: string, p: unknown, ack: (res: unknown) => void) => void)(
      event, payload, (res: unknown) => {
        clearTimeout(timer);
        if (!res) return reject(new Error('sem resposta do servidor'));
        if (typeof res === 'object' && 'error' in res) {
          return reject(new Error(String((res as { error: string }).error)));
        }
        resolve(res as ResultOf<K>);
      },
    );
  });
}

/** Disparo sem resposta (voice:state, rtc:signal, annot:*, screen:preview). */
export function tell<K extends keyof ClientEvents>(event: K, payload: Parameters<ClientEvents[K]>[0]): void {
  (socket?.emit as ((e: string, p: unknown) => void) | undefined)?.(event, payload);
}
