'use strict';

/**
 * Canais de texto.
 *
 * O histórico é curto de propósito: guardamos as últimas 200 mensagens por
 * canal e devolvemos 100. Este servidor guarda tudo num JSON, e um histórico
 * ilimitado viraria um arquivo de centenas de megabytes carregado inteiro na
 * memória a cada boot.
 */

const { cleanMultiline, uid } = require('../util');

const KEEP_ON_DISK = 200;
const SEND_ON_HISTORY = 100;
const MAX_MESSAGE_CHARS = 2000;

function registerMessages(socket, ctx) {
  const { store, guard, presence, publicUser, io } = ctx;
  const db = () => store.data;

  /** O canal de texto pedido, se eu tiver acesso a ele. */
  function requireTextChannel(guildId, channelId) {
    const session = presence.sessions.get(socket.id);
    const guild = db().guilds[guildId];
    if (!session || !guild || !guild.members.includes(session.userId)) throw new Error('sem acesso');

    const channel = guild.channels.find((c) => c.id === channelId && c.type === 'text');
    if (!channel) throw new Error('canal de texto inexistente');
    return { session, channel };
  }

  socket.on('message:history', ({ guildId, channelId } = {}, cb) => guard(cb, () => {
    const { channel } = requireTextChannel(guildId, channelId);
    cb({ messages: (channel.messages || []).slice(-SEND_ON_HISTORY) });
  }));

  socket.on('message:send', ({ guildId, channelId, text } = {}, cb) => guard(cb, () => {
    const { session, channel } = requireTextChannel(guildId, channelId);

    const body = cleanMultiline(text, MAX_MESSAGE_CHARS);
    if (!body) throw new Error('a mensagem está vazia');

    const message = { id: uid(), userId: session.userId, text: body, createdAt: Date.now() };
    channel.messages = (channel.messages || []).concat(message).slice(-KEEP_ON_DISK);
    store.save();

    // Vai para o servidor inteiro (não só para quem está com o canal aberto),
    // para que a notificação chegue a quem está em outra tela.
    const withAuthor = { ...message, user: publicUser(session.userId) };
    io.to(presence.guildRoom(guildId)).emit('message:new', { guildId, channelId, message: withAuthor });
    cb({ message: withAuthor });
  }));
}

module.exports = { registerMessages };
