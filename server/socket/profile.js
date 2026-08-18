'use strict';

/**
 * Perfil e amigos.
 *
 * "Amigo" aqui é uma marcação unilateral e privada — não existe pedido nem
 * aceite. Serve só para ordenar a lista de membros: numa comunidade grande, é
 * a diferença entre achar seu grupo na hora e rolar por trinta nomes.
 */

const { cleanAssetPath, cleanMultiline, cleanText, isHexColor } = require('../util');

function registerProfile(socket, ctx) {
  const { store, guard, presence, publicUser, io } = ctx;
  const db = () => store.data;

  /** O usuário desta sessão, ou erro se o socket não estiver autenticado. */
  function requireUser() {
    const session = presence.sessions.get(socket.id);
    if (!session) throw new Error('nao autenticado');
    const user = db().users[session.userId];
    if (!user) throw new Error('usuario inexistente');
    return user;
  }

  socket.on('user:update', (patch = {}, cb) => guard(cb, () => {
    const user = requireUser();

    if (patch.name !== undefined) user.name = cleanText(patch.name, 32, user.name);
    if (patch.bio !== undefined) user.bio = cleanMultiline(patch.bio, 300);
    if (patch.pronouns !== undefined) user.pronouns = cleanText(patch.pronouns, 20);
    if (patch.accent !== undefined && isHexColor(patch.accent)) user.accent = patch.accent;

    for (const key of ['avatar', 'banner']) {
      if (patch[key] === undefined) continue;
      const clean = cleanAssetPath(patch[key]);
      // `undefined` significa "esse caminho não veio de nós" — recusamos em
      // vez de apagar a imagem que a pessoa já tinha.
      if (clean === undefined) throw new Error('imagem invalida');
      user[key] = clean;
    }

    store.save();
    const me = publicUser(user.id);
    cb({ user: me });

    for (const guild of presence.guildsOf(user.id)) {
      io.to(presence.guildRoom(guild.id)).emit('user:update', me);
      presence.pushPresence(guild.id);
    }
  }));

  socket.on('friend:add', ({ friendId } = {}, cb) => guard(cb, () => {
    const user = requireUser();
    if (!friendId || !db().users[friendId]) throw new Error('usuario nao encontrado');
    if (friendId === user.id) throw new Error('nao dá pra se adicionar');

    user.friends = user.friends || [];
    if (!user.friends.includes(friendId)) user.friends.push(friendId);
    store.save();
    cb({ friends: user.friends });
  }));

  socket.on('friend:remove', ({ friendId } = {}, cb) => guard(cb, () => {
    const user = requireUser();
    user.friends = (user.friends || []).filter((id) => id !== friendId);
    store.save();
    cb({ friends: user.friends });
  }));
}

module.exports = { registerProfile };
