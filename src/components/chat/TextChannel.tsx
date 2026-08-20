import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SendHorizontal } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { timeOfDay } from '@/lib/format';
import { messageKey, useMessages } from '@/stores/messages';
import { useGuilds } from '@/stores/guilds';
import { sendMessage } from '@/features/messages/actions';
import { FormattedText } from '@/components/ui/FormattedText';
import { YouTubeCard, extractYouTubeVideoId, removeYouTubeLinks } from './YouTubeCard';
import type { ChatMessage, PublicUser } from '@/types/api';

const UNKNOWN: Pick<PublicUser, 'name' | 'avatar' | 'color'> = {
  name: 'Desconhecido',
  avatar: '',
  color: '#5865f2',
};

/** Um canal de texto: histórico e campo de escrita. */
export function TextChannel({ guildId, channelId }: { guildId: string; channelId: string }) {
  const messages = useMessages((s) => s.byChannel.get(messageKey(guildId, channelId))) ?? [];
  const members = useGuilds((s) => s.guilds.find((g) => g.id === guildId)?.members) ?? [];
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Mensagem nova rola até o fim. Fica no efeito (e não no envio) para valer
  // também para o que chega dos outros.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const ok = await sendMessage(guildId, channelId, text);
    if (!ok) setDraft(text); // devolve o texto para não perder o que foi escrito
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="font-semibold text-bright">Comece a conversa</p>
              <p className="text-[13px] text-dim">As mensagens deste canal ficam salvas no servidor.</p>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message, i) => (
              <MessageRow
                key={message.id}
                message={message}
                author={message.user ?? members.find((m) => m.id === message.userId) ?? UNKNOWN}
                // Mensagens seguidas da mesma pessoa não repetem cabeçalho.
                grouped={isGrouped(message, messages[i - 1])}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
        <TextArea
          rows={1}
          value={draft}
          maxLength={2000}
          placeholder="Enviar mensagem"
          className="max-h-40 min-h-10 flex-1"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit(e);
            }
          }}
        />
        <Button type="submit" variant="primary" disabled={!draft.trim()}>
          <SendHorizontal size={16} />
          Enviar
        </Button>
      </form>
    </div>
  );
}

/** Mesma pessoa, dentro de cinco minutos: continua o bloco anterior. */
function isGrouped(message: ChatMessage, previous: ChatMessage | undefined): boolean {
  if (!previous || previous.userId !== message.userId) return false;
  return message.createdAt - previous.createdAt < 5 * 60 * 1000;
}

interface MessageRowProps {
  message: ChatMessage;
  author: Pick<PublicUser, 'name' | 'avatar' | 'color'>;
  grouped: boolean;
}

function MessageRow({ message, author, grouped }: MessageRowProps) {
  const youtubeVideoId = useMemo(() => extractYouTubeVideoId(message.text), [message.text]);
  const displayText = useMemo(() => {
    return youtubeVideoId ? removeYouTubeLinks(message.text) : message.text;
  }, [message.text, youtubeVideoId]);

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-3 rounded-[var(--radius-sm)] px-2 py-0.5 hover:bg-hover/60"
    >
      <div className="w-9 shrink-0 pt-1">{!grouped && <Avatar user={author} size="sm" />}</div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-bright">{author.name}</span>
            <time className="text-[11px] text-dim">{timeOfDay(message.createdAt)}</time>
          </div>
        )}
        {displayText && (
          <FormattedText
            text={displayText}
            className="selectable text-[14px] leading-relaxed whitespace-pre-wrap text-text"
          />
        )}
        {youtubeVideoId && <YouTubeCard videoId={youtubeVideoId} />}
      </div>
    </motion.article>
  );
}
