'use strict';

/**
 * Salas de voz, sinalização WebRTC, prévia de tela e anotações.
 *
 * O servidor nunca vê áudio nem vídeo. Ele só apresenta os participantes uns
 * aos outros e repassa três coisas leves: SDP/ICE, uma miniatura estática de
 * quem transmite, e os traços de quem rabisca. A mídia vai ponto a ponto.
 */

/** Segunda trava sobre a miniatura; o maxHttpBufferSize do socket.io é a primeira. */
const MAX_PREVIEW_CHARS = 200_000;
/** Ids de stream vêm do navegador, mas chegam pela rede — cortamos por garantia. */
const MAX_STREAM_ID = 128;

function registerVoice(socket, ctx) {
  const { store, guard, presence, io } = ctx;
  const db = () => store.data;

  const session = () => presence.sessions.get(socket.id);

  socket.on('voice:join', ({ guildId, channelId } = {}, cb) => guard(cb, () => {
    const s = session();
    if (!s) throw new Error('nao autenticado');

    const guild = db().guilds[guildId];
    if (!guild || !guild.members.includes(s.userId)) throw new Error('sem acesso a este servidor');
    if (!guild.channels.some((c) => c.id === channelId && c.type !== 'text')) {
      throw new Error('sala de voz inexistente');
    }

    presence.leaveVoice(socket);
    const room = presence.voiceRoom(guildId, channelId);
    socket.join(room);
    s.room = room;
    s.state = presence.emptyState();

    const others = [...(io.sockets.adapter.rooms.get(room) || [])]
      .filter((id) => id !== socket.id)
      .map(presence.peerInfo)
      .filter(Boolean);

    socket.to(room).emit('voice:peerJoined', presence.peerInfo(socket.id));
    cb({ peers: others });
    presence.pushPresence(guildId);
  }));

  socket.on('voice:leave', (_payload, cb) => guard(cb, () => {
    presence.leaveVoice(socket);
    if (typeof cb === 'function') cb({ ok: true });
  }));

  socket.on('voice:state', (state = {}) => {
    const s = session();
    if (!s || !s.room) return;

    s.state = {
      mic: !!state.mic,
      screen: !!state.screen,
      speaking: !!state.speaking,
      annot: state.annot !== false,
      streams: {
        mic: state.streams && state.streams.mic ? String(state.streams.mic).slice(0, MAX_STREAM_ID) : null,
        screen: state.streams && state.streams.screen ? String(state.streams.screen).slice(0, MAX_STREAM_ID) : null,
      },
    };

    socket.to(s.room).emit('voice:state', { sid: socket.id, state: s.state });
    presence.pushPresence(presence.guildOfRoom(s.room));
  });

  /** Repasse cego de SDP e ICE — só entre quem está na mesma sala. */
  socket.on('rtc:signal', ({ to, data } = {}) => {
    const s = session();
    const target = presence.sessions.get(to);
    if (!s || !s.room || !target || target.room !== s.room) return;
    io.to(to).emit('rtc:signal', { from: socket.id, data });
  });

  /**
   * Miniatura estática de quem transmite, para quem ainda não pediu o vídeo
   * de verdade. Custa quase nada perto de um stream por espectador.
   */
  socket.on('screen:preview', (payload = {}) => {
    const s = session();
    if (!s || !s.room) return;
    const dataUrl = payload.dataUrl ? String(payload.dataUrl).slice(0, MAX_PREVIEW_CHARS) : null;
    socket.to(s.room).emit('screen:preview', { from: socket.id, dataUrl });
  });

  // Traços são pontos normalizados, ou seja, poucos bytes — vão pelo socket
  // mesmo, e assim funcionam antes da conexão P2P terminar de subir.
  socket.on('annot:draw', (payload = {}) => {
    const s = session();
    if (!s || !s.room || !payload.target) return;
    socket.to(s.room).emit('annot:draw', { from: socket.id, ...payload });
  });

  socket.on('annot:clear', (payload = {}) => {
    const s = session();
    if (!s || !s.room) return;
    socket.to(s.room).emit('annot:clear', { from: socket.id, ...payload });
  });
}

module.exports = { registerVoice };
