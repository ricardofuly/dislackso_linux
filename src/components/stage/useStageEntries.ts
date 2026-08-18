import { useMemo } from 'react';
import { voice } from '@/lib/rtc/engine';
import { useRoom } from '@/stores/room';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import type { PublicUser } from '@/types/api';

export interface StageEntry {
  /** `'local'`, o sid de um participante, ou `'waiting'` para o card vazio. */
  id: string;
  user: PublicUser | null;
  stream: MediaStream | null;
  isLocal: boolean;
  /** Dá para exibir vídeo agora. */
  sharing: boolean;
  /**
   * A pessoa *anunciou* que está transmitindo. A mídia chega alguns instantes
   * depois do aviso, e o destaque precisa sobreviver a essa janela — por isso
   * são dois campos, e não um.
   */
  intendsScreen: boolean;
  speaking: boolean;
  canAnnotate: boolean;
  /** Texto sob o avatar quando não há vídeo. */
  status: string;
}

const CONNECTION_STATUS: Record<string, string> = {
  connected: 'Sem tela compartilhada',
  failed: 'Falha na conexão',
};

/**
 * O que deve aparecer no palco agora.
 *
 * Recalcula a cada `tick` do motor (ver `useEngineBridge`), que é o sinal de
 * que alguma faixa ou conexão mudou.
 */
export function useStageEntries(): StageEntry[] {
  const tick = useRoom((s) => s.tick);
  const me = useSession((s) => s.me);
  const selfPreview = useSettings((s) => s.selfPreview);

  return useMemo(() => {
    const entries: StageEntry[] = [];

    if (voice.screen.active && selfPreview) {
      entries.push({
        id: 'local',
        user: me,
        stream: voice.screen.stream,
        isLocal: true,
        sharing: true,
        intendsScreen: true,
        speaking: voice.mic.speaking,
        canAnnotate: true,
        status: 'Você',
      });
    }

    for (const peer of voice.mesh.peers.values()) {
      const announced = Boolean(peer.state?.screen);
      const stream = announced ? peer.screenStream() : null;

      entries.push({
        id: peer.sid,
        user: peer.user,
        stream,
        isLocal: false,
        sharing: announced && Boolean(stream),
        intendsScreen: announced,
        speaking: Boolean(peer.state?.speaking),
        canAnnotate: peer.state?.annot !== false,
        status: CONNECTION_STATUS[peer.pc.connectionState] ?? 'Conectando…',
      });
    }

    if (!entries.length) {
      entries.push({
        id: 'waiting',
        user: me,
        stream: null,
        isLocal: true,
        sharing: false,
        intendsScreen: false,
        speaking: false,
        canAnnotate: false,
        status: 'Convide seus amigos ou comece a transmitir',
      });
    }

    return entries;
    // `tick` é o gatilho: o motor não é reativo, então é ele que diz quando
    // vale a pena recalcular.

  }, [tick, me, selfPreview]);
}

/**
 * Quem está em destaque agora, se é que alguém está.
 *
 * Só desiste do destaque quando a pessoa saiu ou parou de transmitir de fato
 * — não enquanto a mídia dela ainda está a caminho.
 */
export function resolveFocus(entries: StageEntry[], focusId: string | null): StageEntry | null {
  if (!focusId) return null;
  const wanted = entries.find((e) => e.id === focusId);
  if (!wanted?.intendsScreen) return null;
  return wanted.sharing ? wanted : null;
}
