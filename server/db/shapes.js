'use strict';

/**
 * As formas dos dados: como um usuário e um servidor nascem, e o que deles
 * pode sair para a rede.
 *
 * `publicUser` e `publicGuild` são a barreira de privacidade do sistema — é
 * aqui, e só aqui, que se decide o que os outros podem ver. `passwordHash` e
 * `token` nunca atravessam estas funções.
 */

const { cleanText, colorFor, uid } = require('../util');

function defaultUser(id, username, name) {
  return {
    id,
    username,
    passwordHash: '',
    token: '',
    name: cleanText(name || username, 32, 'Anonimo'),
    color: colorFor(id),
    accent: colorFor(id),
    avatar: '',
    banner: '',
    bio: '',
    pronouns: '',
    friends: [],
    createdAt: Date.now(),
  };
}

/** Guardamos as últimas 200 mensagens por canal; a API devolve 100. */
function normalizeChannel(channel) {
  return {
    id: channel.id || uid(),
    name: cleanText(channel.name, 32, 'novo-canal'),
    type: channel.type === 'text' ? 'text' : 'voice',
    messages: Array.isArray(channel.messages) ? channel.messages.slice(-200) : [],
  };
}

/** Um usuário desconhecido ainda precisa de nome e cor para a interface. */
function unknownUser(userId) {
  return {
    id: userId,
    username: '',
    name: 'Desconhecido',
    color: colorFor(userId),
    accent: colorFor(userId),
    avatar: '',
    banner: '',
    bio: '',
    pronouns: '',
  };
}

/**
 * @param getUsers acessor, não o objeto: `store.restore()` substitui o banco
 * inteiro ao ler do Supabase, e uma referência capturada apontaria para o
 * objeto antigo — todo mundo viraria "Desconhecido" depois de um redeploy.
 */
function makePublicUser(getUsers) {
  return function publicUser(userId) {
    const u = getUsers()[userId];
    if (!u) return unknownUser(userId);
    return {
      id: u.id,
      username: u.username || '',
      name: u.name,
      color: u.color,
      accent: u.accent || u.color,
      avatar: u.avatar || '',
      banner: u.banner || '',
      bio: u.bio || '',
      pronouns: u.pronouns || '',
      createdAt: u.createdAt,
    };
  };
}

function makePublicGuild(publicUser) {
  return function publicGuild(guild) {
    return {
      id: guild.id,
      name: guild.name,
      ownerId: guild.ownerId,
      invite: guild.invite,
      icon: guild.icon || '',
      // As mensagens ficam de fora: chegam por `message:history`, sob demanda.
      channels: guild.channels.map(({ messages, ...channel }) => channel),
      members: guild.members.map(publicUser),
    };
  };
}

module.exports = { defaultUser, normalizeChannel, makePublicUser, makePublicGuild };
