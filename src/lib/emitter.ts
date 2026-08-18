/**
 * Emissor de eventos mínimo e tipado.
 *
 * O motor de mídia é imperativo por natureza (WebRTC é uma máquina de estados
 * cheia de callbacks) e não deve depender do React. Ele avisa a interface por
 * aqui; a interface se inscreve com um hook.
 */
export class Emitter<Events extends object> {
  private listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(name: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(fn as (payload: never) => void);
    return () => set.delete(fn as (payload: never) => void);
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    for (const fn of this.listeners.get(name) ?? []) {
      try {
        (fn as (p: Events[K]) => void)(payload);
      } catch (err) {
        console.error('[emitter]', String(name), err);
      }
    }
  }
}
