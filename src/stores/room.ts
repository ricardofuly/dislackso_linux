import { create } from 'zustand';
import { clamp } from '@/lib/format';

export interface ActiveRoom {
  guildId: string;
  channelId: string;
}

interface RoomState {
  /** A sala de voz em que estou, ou `null`. */
  room: ActiveRoom | null;
  /** Tile em destaque: `'local'`, um sid, ou `null` para a grade. */
  focusId: string | null;
  /** Quem eu já pedi para assistir (recebo o vídeo de verdade). */
  watching: Set<string>;
  /** sid → miniatura estática da tela de quem ainda não estou assistindo. */
  previews: Map<string, string>;
  /** Quem eu vi começar a transmitir — evita avisar duas vezes. */
  sharingSeen: Set<string>;
  /** sid → mutado só para mim. Não afeta os outros. */
  localMutes: Set<string>;
  /** sid → volume individual (0..2), só para mim. */
  localVolumes: Map<string, number>;
  /**
   * Sobe a cada evento do motor de mídia. É o gatilho de re-render para a
   * parte da interface que lê direto do motor (que não é reativo).
   */
  tick: number;

  enter(room: ActiveRoom): void;
  leave(): void;
  focus(id: string | null): void;
  watch(sid: string): void;
  unwatch(sid: string): void;
  setPreview(sid: string, dataUrl: string | null): void;
  markSharing(sid: string, sharing: boolean): void;
  toggleMute(sid: string): void;
  bumpVolume(sid: string, delta: number): number;
  bump(): void;
}

/**
 * O estado da sala do ponto de vista da interface.
 *
 * Não confundir com o motor de mídia: ali ficam conexões e faixas, aqui fica
 * o que eu escolhi ver e ouvir — destaque, quem estou assistindo, quem eu
 * silenciei só para mim.
 */
export const useRoom = create<RoomState>()((set, get) => ({
  room: null,
  focusId: null,
  watching: new Set(),
  previews: new Map(),
  sharingSeen: new Set(),
  localMutes: new Set(),
  localVolumes: new Map(),
  tick: 0,

  enter(room) {
    set({ room, focusId: null, sharingSeen: new Set() });
  },

  leave() {
    set({
      room: null,
      focusId: null,
      watching: new Set(),
      previews: new Map(),
      sharingSeen: new Set(),
    });
  },

  focus(id) {
    set({ focusId: id });
  },

  watch(sid) {
    set({ watching: new Set(get().watching).add(sid) });
  },

  unwatch(sid) {
    const watching = new Set(get().watching);
    watching.delete(sid);
    const previews = new Map(get().previews);
    previews.delete(sid);
    set({ watching, previews, focusId: get().focusId === sid ? null : get().focusId });
  },

  setPreview(sid, dataUrl) {
    const previews = new Map(get().previews);
    if (dataUrl) previews.set(sid, dataUrl);
    else previews.delete(sid);
    set({ previews });
  },

  markSharing(sid, sharing) {
    const sharingSeen = new Set(get().sharingSeen);
    if (sharing) sharingSeen.add(sid);
    else sharingSeen.delete(sid);
    set({ sharingSeen });
  },

  toggleMute(sid) {
    const localMutes = new Set(get().localMutes);
    if (localMutes.has(sid)) localMutes.delete(sid);
    else localMutes.add(sid);
    set({ localMutes });
  },

  bumpVolume(sid, delta) {
    const current = get().localVolumes.get(sid) ?? 1;
    const next = clamp(current + delta, 0, 2);
    set({ localVolumes: new Map(get().localVolumes).set(sid, next) });
    return next;
  },

  bump() {
    set({ tick: get().tick + 1 });
  },
}));
