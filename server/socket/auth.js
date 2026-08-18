'use strict';

/**
 * Conta e sessão: registrar, entrar, e a retomada silenciosa de quem já tinha
 * um token salvo.
 *
 * Não há e-mail nem recuperação de senha — de propósito. É um app para um
 * grupo de amigos, e a alternativa (SMTP, verificação, reset) seria mais
 * infraestrutura do que o resto do servidor inteiro.
 */

const { defaultUser } = require('../db/shapes');
const { hashPassword, isValidUsername, newToken, uid, verifyPassword } = require('../util');

const MIN_PASSWORD = 6;
const ERR_USERNAME = 'Nickname precisa ter de 3 a 20 letras, números ou _.';
const ERR_PASSWORD = `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
const ERR_TAKEN = 'Esse nickname já está em uso.';

function registerAuth(socket, ctx) {
  const { store, guard, presence, publicUser, publicGuild, iceServers } = ctx;
  const db = () => store.data;

  /** Abre a sessão deste socket e monta o payload que todo login responde. */
  function establishSession(user) {
    presence.sessions.set(socket.id, {
      userId: user.id,
      room: null,
      state: presence.emptyState(),
    });

    const guilds = presence.guildsOf(user.id);
    for (const guild of guilds) socket.join(presence.guildRoom(guild.id));

    const payload = {
      user: publicUser(user.id),
      guilds: guilds.map(publicGuild),
      iceServers,
      sid: socket.id,
      token: user.token,
      friends: user.friends || [],
    };

    for (const guild of guilds) {
      presence.pushPresence(guild.id);
      presence.pushOnline(guild.id);
    }
    return payload;
  }

  function validateCredentials(username, password) {
    if (!isValidUsername(username)) throw new Error(ERR_USERNAME);
    if (!password || String(password).length < MIN_PASSWORD) throw new Error(ERR_PASSWORD);
    const key = String(username).toLowerCase();
    if (db().usernames[key]) throw new Error(ERR_TAKEN);
    return key;
  }

  // Retomada silenciosa: o cliente já tem userId e token salvos.
  socket.on('hello', ({ userId, token } = {}, cb) => guard(cb, () => {
    const user = userId && db().users[userId];
    if (!user || !user.token || !token || user.token !== token) throw new Error('auth_required');
    store.save();
    cb(establishSession(user));
  }));

  socket.on('auth:register', ({ username, password, name } = {}, cb) => guard(cb, () => {
    const key = validateCredentials(username, password);

    const id = uid();
    const user = defaultUser(id, username, name);
    user.passwordHash = hashPassword(password);
    user.token = newToken();

    db().users[id] = user;
    db().usernames[key] = id;
    store.save();
    cb(establishSession(user));
  }));

  socket.on('auth:login', ({ username, password } = {}, cb) => guard(cb, () => {
    const id = db().usernames[String(username || '').toLowerCase()];
    const user = id && db().users[id];
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      // Mesma mensagem para usuário inexistente e senha errada: dizer qual dos
      // dois falhou entrega quais nicknames existem.
      throw new Error('Nickname ou senha incorretos.');
    }
    user.token = newToken();
    store.save();
    cb(establishSession(user));
  }));

  /**
   * Adota uma conta anônima antiga (de antes do login existir), preservando
   * servidores e avatar. Só funciona enquanto ela não tiver senha — depois
   * disso, seria uma forma de tomar a conta de outra pessoa.
   */
  socket.on('auth:claim', ({ userId, username, password } = {}, cb) => guard(cb, () => {
    const user = userId && db().users[userId];
    if (!user) throw new Error('Conta não encontrada.');
    if (user.passwordHash) throw new Error('Essa conta já tem senha; use Entrar.');

    const key = validateCredentials(username, password);
    user.username = username;
    user.passwordHash = hashPassword(password);
    user.token = newToken();
    db().usernames[key] = user.id;

    store.save();
    cb(establishSession(user));
  }));
}

module.exports = { registerAuth };
