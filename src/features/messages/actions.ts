import { ask } from '@/lib/socket/client';
import { useGuilds } from '@/stores/guilds';
import { useMessages } from '@/stores/messages';
import { toast } from '@/stores/toasts';

/**
 * Abre um canal de texto e recarrega o histórico.
 *
 * Recarrega sempre, mesmo que já tenhamos mensagens em memória: enquanto o
 * canal estava fechado podem ter chegado várias, e mostrar só a última
 * (a que veio pelo evento) daria a impressão de que a conversa sumiu.
 */
export async function openTextChannel(guildId: string, channelId: string): Promise<void> {
  useGuilds.getState().openTextChannel(guildId, channelId);
  useMessages.getState().markRead(guildId, channelId);
  try {
    const { messages } = await ask('message:history', { guildId, channelId });
    useMessages.getState().load(guildId, channelId, messages);
  } catch (err) {
    toast(`Não consegui carregar as mensagens: ${(err as Error).message}`);
  }
}

/** Devolve `false` quando falhou, para a interface devolver o texto ao campo. */
export async function sendMessage(
  guildId: string,
  channelId: string,
  text: string,
): Promise<boolean> {
  try {
    const { message } = await ask('message:send', { guildId, channelId, text });
    useMessages.getState().append(guildId, channelId, message);
    return true;
  } catch (err) {
    toast(`Não consegui enviar: ${(err as Error).message}`);
    return false;
  }
}
