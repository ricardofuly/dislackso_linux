import { ask } from '@/lib/socket/client';
import { feedback } from '@/lib/feedback';
import { desktop, isDesktop } from '@/lib/platform';
import { voice } from '@/lib/rtc/engine';
import { annot } from '@/lib/annot/engine';
import { useGuilds } from '@/stores/guilds';
import { useRoom } from '@/stores/room';
import { useSettings } from '@/stores/settings';
import { toast } from '@/stores/toasts';
import { useSession } from '@/stores/session';

/**
 * Entra numa sala de voz.
 *
 * Clicar na sala em que já estou não é um no-op: quando um canal de texto
 * está aberto por cima, a transmissão "some" da tela, e clicar na sala de
 * novo é o jeito natural de voltar a vê-la.
 */
export async function joinVoice(guildId: string, channelId: string): Promise<void> {
  if (!useSession.getState().me) {
    toast('Ainda conectando… tente de novo em um instante.');
    return;
  }

  const current = useRoom.getState().room;
  if (current?.guildId === guildId && current.channelId === channelId) {
    useGuilds.getState().openTextChannel(guildId, null);
    return;
  }

  if (current) await leaveVoice({ silent: true });

  try {
    const { peers } = await ask('voice:join', { guildId, channelId });
    useRoom.getState().enter({ guildId, channelId });
    useGuilds.getState().openTextChannel(guildId, null);

    await voice.start();

    const autoFocus = useSettings.getState().autoFocus;
    for (const info of peers) {
      voice.mesh.add(info);
      // Alguém já estava transmitindo quando entrei: destaca essa tela.
      if (info.state?.screen) {
        useRoom.getState().markSharing(info.sid, true);
        if (autoFocus && !useRoom.getState().focusId) useRoom.getState().focus(info.sid);
      }
    }

    voice.publishState();
    toast('Você entrou na sala.');
    feedback('join');
  } catch (err) {
    toast(`Não foi possível entrar: ${(err as Error).message}`);
  }
}

export async function leaveVoice({ silent = false } = {}): Promise<void> {
  if (!useRoom.getState().room) return;

  useRoom.getState().leave();
  annot.setActive(null);
  voice.stop();

  try {
    await ask('voice:leave', {});
  } catch {
    /* já pode ter caído a conexão; o servidor limpa sozinho no disconnect */
  }

  if (!silent) toast('Você saiu da sala.');
}

/** Começa a receber o vídeo de verdade de quem está transmitindo. */
export function watchPeer(sid: string): void {
  voice.watch(sid);
  useRoom.getState().watch(sid);
}

export function unwatchPeer(sid: string): void {
  voice.unwatch(sid);
  useRoom.getState().unwatch(sid);
}

export function toggleScreen(): void {
  if (voice.screen.active) voice.screen.stop();
  else void voice.screen.start();
}

/**
 * Tela cheia de verdade num tile — como o YouTube: só ele na tela, o resto
 * da interface some. É estado do app (não a Fullscreen API do navegador,
 * que no Electron não reage de forma confiável), com um bônus quando dá:
 * pedir pra própria janela também ficar em tela cheia do sistema, ganhando
 * a faixa que a barra de título ocupava.
 */
export function enterFullscreen(id: string): void {
  useRoom.getState().enterFullscreen(id);
  if (isDesktop()) void desktop()?.toggleFullscreen();
}

/** Sempre os mesmos dois passos da entrada, na ordem inversa. */
export function exitFullscreen(): void {
  useRoom.getState().exitFullscreen();
  if (isDesktop()) void desktop()?.toggleFullscreen();
}
