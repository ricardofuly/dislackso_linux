'use strict';

/**
 * Quem está onde.
 *
 * São duas noções diferentes, de propósito:
 *
 *   presença — está nesta sala de voz agora. Muda várias vezes por minuto
 *              numa conversa (todo "está falando" é uma mudança).
 *   online   — está com o app aberto. Muda raramente.
 *
 * Juntá-las faria a lista de membros repintar toda vez que alguém abre o
 * microfone.
 */

const guildRoom = (guildId) => `guild:${guildId}`;
const voiceRoom = (guildId, channelId) => `voice:${guildId}/${channelId}`;

/** O estado de voz de quem acabou de entrar numa sala. */
const emptyState = () => ({
  mic: false,
  screen: false,
  speaking: false,
  annot: true,
  streams: {},
});

/** `voice:<guildId>/<channelId>` → `<guildId>` */
const guildOfRoom = (room) => room.slice('voice:'.length).split('/')[0];

function createPresence({ io, store, publicUser, publicGuild }) {
  /** socketId → { userId, room, state } */
  const sessions = new Map();

  function peerInfo(socketId) {
    const session = sessions.get(socketId);
    if (!session) return null;
    return { sid: socketId, user: publicUser(session.userId), state: session.state };
  }

  /** Todos os canais de voz de um servidor com quem está dentro de cada um. */
  function guildPresence(guildId) {
    const guild = store.data.guilds[guildId];
    if (!guild) return {};

    const presence = {};
    for (const channel of guild.channels) {
      const room = io.sockets.adapter.rooms.get(voiceRoom(guildId, channel.id));
      presence[channel.id] = [...(room || [])].map(peerInfo).filter(Boolean);
    }
    return presence;
  }

  /** Ids de quem está com o app aberto neste servidor (não só em sala de voz). */
  function guildOnlineIds(guildId) {
    const room = io.sockets.adapter.rooms.get(guildRoom(guildId));
    const ids = new Set();
    for (const sid of room || []) {
      const session = sessions.get(sid);
      if (session) ids.add(session.userId);
    }
    return [...ids];
  }

  const pushPresence = (guildId) =>
    io.to(guildRoom(guildId)).emit('presence:update', { guildId, presence: guildPresence(guildId) });

  const pushOnline = (guildId) =>
    io.to(guildRoom(guildId)).emit('guild:online', { guildId, online: guildOnlineIds(guildId) });

  function pushGuild(guildId) {
    const guild = store.data.guilds[guildId];
    if (guild) io.to(guildRoom(guildId)).emit('guild:update', publicGuild(guild));
  }

  /** Servidores dos quais o usuário participa. */
  const guildsOf = (userId) =>
    Object.values(store.data.guilds).filter((g) => g.members.includes(userId));

  function leaveVoice(socket) {
    const session = sessions.get(socket.id);
    if (!session || !session.room) return;

    const room = session.room;
    socket.leave(room);
    session.room = null;
    session.state = emptyState();

    socket.to(room).emit('voice:peerLeft', { sid: socket.id });
    pushPresence(guildOfRoom(room));
  }

  /** Remove todos de uma sala de voz — usado quando o canal deixa de existir. */
  function evictVoiceRoom(guildId, channelId) {
    const room = voiceRoom(guildId, channelId);
    for (const sid of io.sockets.adapter.rooms.get(room) ?? []) {
      const sock = io.sockets.sockets.get(sid);
      if (sock) leaveVoice(sock);
    }
  }

  return {
    sessions,
    guildRoom,
    voiceRoom,
    emptyState,
    guildOfRoom,
    peerInfo,
    pushPresence,
    pushOnline,
    pushGuild,
    guildsOf,
    leaveVoice,
    evictVoiceRoom,
  };
}

module.exports = { createPresence };
