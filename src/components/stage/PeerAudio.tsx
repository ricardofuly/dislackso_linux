import { useEffect, useRef } from 'react';
import { voice } from '@/lib/rtc/engine';
import { clamp } from '@/lib/format';
import { useRoom } from '@/stores/room';
import { useSettings } from '@/stores/settings';

function getDuckFactor(setting: string | boolean): number {
  if (setting === false || setting === 'off') return 1;
  if (setting === 'mute') return 0;
  if (setting === 'duck10') return 0.1;
  if (setting === 'duck25' || setting === true) return 0.25;
  if (setting === 'duck50') return 0.5;
  return 1;
}

/**
 * O áudio de microfone de cada participante.
 *
 * Fica em `<audio>` fora da grade de vídeo de propósito: o áudio precisa
 * continuar tocando quando o tile da pessoa some (destaque, filmstrip, canal
 * de texto aberto por cima). Se dependesse do `<video>`, trocar de tela
 * mudaria quem se ouve.
 */
export function PeerAudio() {
  const tick = useRoom((s) => s.tick);
  const localMutes = useRoom((s) => s.localMutes);
  const localVolumes = useRoom((s) => s.localVolumes);
  const speakerId = useSettings((s) => s.speakerId);
  const duckOnShare = useSettings((s) => s.duckVoiceOnShare);

  const nodes = useRef(new Map<string, HTMLAudioElement>());

  useEffect(() => {
    const sharingWithAudio =
      voice.screen.active && (voice.screen.stream?.getAudioTracks().length ?? 0) > 0;
    const duck = sharingWithAudio ? getDuckFactor(duckOnShare) : 1;

    const alive = new Set<string>();

    for (const peer of voice.mesh.peers.values()) {
      const stream = peer.micStream();
      if (!stream) continue;
      alive.add(peer.sid);

      let node = nodes.current.get(peer.sid);
      if (!node) {
        node = document.createElement('audio');
        node.autoplay = true;
        document.body.appendChild(node);
        nodes.current.set(peer.sid, node);
      }
      if (node.srcObject !== stream) {
        node.srcObject = stream;
        node.play().catch(() => {});
      }

      node.volume = voice.deafened || localMutes.has(peer.sid)
        ? 0
        : clamp((localVolumes.get(peer.sid) ?? 1) * duck, 0, 1);

      applySink(node, speakerId);
    }

    for (const [sid, node] of nodes.current) {
      if (alive.has(sid)) continue;
      node.srcObject = null;
      node.remove();
      nodes.current.delete(sid);
    }
  }, [tick, localMutes, localVolumes, speakerId, duckOnShare]);

  // Ao desmontar (sair da sala), leva todos os elementos junto.
  useEffect(() => {
    const map = nodes.current;
    return () => {
      for (const node of map.values()) {
        node.srcObject = null;
        node.remove();
      }
      map.clear();
    };
  }, []);

  return null;
}

/** Manda o áudio para a saída escolhida nas configurações, quando o navegador deixa. */
function applySink(node: HTMLAudioElement, speakerId: string): void {
  if (!('setSinkId' in HTMLMediaElement.prototype)) return;
  const sinkable = node as HTMLAudioElement & { setSinkId(id: string): Promise<void> };
  if (sinkable.sinkId === speakerId) return;
  sinkable.setSinkId(speakerId || '').catch((err: Error) => {
    console.warn('[audio] saída:', err.message);
  });
}
