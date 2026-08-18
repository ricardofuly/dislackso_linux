'use strict';

/**
 * Verifica que excluir um canal de voz remove todos da sala no servidor.
 * Rode com: node scripts/test-channel-delete.js
 */

const assert = require('node:assert/strict');
const { createPresence } = require('../server/socket/presence');

const guildId = 'g1';
const channelId = 'c1';
const voiceRoomName = `voice:${guildId}/${channelId}`;

function makeSocket(id) {
  const rooms = new Set([voiceRoomName]);
  const emitted = [];
  return {
    id,
    rooms,
    join(room) {
      rooms.add(room);
    },
    leave(room) {
      rooms.delete(room);
    },
    to() {
      return { emit: (...args) => emitted.push(['to', ...args]) };
    },
    emitted,
  };
}

function run() {
  const sockets = new Map([
    ['s1', makeSocket('s1')],
    ['s2', makeSocket('s2')],
  ]);

  const store = {
    data: {
      guilds: {
        [guildId]: {
          id: guildId,
          channels: [{ id: channelId, type: 'voice', name: 'Sala' }],
        },
      },
    },
  };

  const io = {
    to: () => ({ emit: () => {} }),
    sockets: {
      adapter: {
        rooms: new Map([[voiceRoomName, new Set(['s1', 's2'])]]),
      },
      sockets,
    },
  };

  const presence = createPresence({
    io,
    store,
    publicUser: (id) => ({ id, name: id }),
    publicGuild: (g) => g,
  });

  presence.sessions.set('s1', {
    userId: 'u1',
    room: voiceRoomName,
    state: { mic: false, screen: false, speaking: false, annot: true, streams: {} },
  });
  presence.sessions.set('s2', {
    userId: 'u2',
    room: voiceRoomName,
    state: { mic: true, screen: false, speaking: false, annot: true, streams: {} },
  });

  presence.evictVoiceRoom(guildId, channelId);

  for (const sid of ['s1', 's2']) {
    const session = presence.sessions.get(sid);
    assert.equal(session.room, null, `${sid} should no longer be in a voice room`);
    assert.equal(sockets.get(sid).rooms.has(voiceRoomName), false, `${sid} should leave socket room`);
  }

  console.log('ok — channel delete evicts all voice participants');
}

run();
