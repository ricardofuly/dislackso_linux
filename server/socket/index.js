'use strict';

/**
 * Junta os handlers de socket.
 *
 * Cada módulo registra os eventos do seu assunto e recebe o mesmo `ctx` —
 * banco, presença e as funções de projeção pública. Nenhum deles conhece os
 * outros.
 */

const { registerAuth } = require('./auth');
const { registerProfile } = require('./profile');
const { registerGuilds } = require('./guilds');
const { registerVoice } = require('./voice');
const { registerMessages } = require('./messages');

/**
 * Converte exceção em `{ error }` no callback.
 *
 * É o contrato do protocolo: o cliente sempre recebe resposta, e o servidor
 * nunca cai por causa de um payload torto vindo da rede.
 */
function guard(cb, fn) {
  try {
    fn();
  } catch (err) {
    if (typeof cb === 'function') cb({ error: err.message || 'erro interno' });
    else console.error('[socket]', err);
  }
}

function attachSocket(io, ctx) {
  const full = { ...ctx, io, guard };

  io.on('connection', (socket) => {
    registerAuth(socket, full);
    registerProfile(socket, full);
    registerGuilds(socket, full);
    registerVoice(socket, full);
    registerMessages(socket, full);

    socket.on('disconnect', () => {
      const session = ctx.presence.sessions.get(socket.id);
      const affected = session ? ctx.presence.guildsOf(session.userId) : [];

      ctx.presence.leaveVoice(socket);
      ctx.presence.sessions.delete(socket.id);

      // Recalcula depois de apagar a sessão: se houver outra aba ou aparelho
      // com o mesmo usuário, ele continua aparecendo online.
      for (const guild of affected) ctx.presence.pushOnline(guild.id);
    });
  });
}

module.exports = { attachSocket };
