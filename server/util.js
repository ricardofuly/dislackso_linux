'use strict';

/**
 * Funções puras compartilhadas pelo servidor: ids, senhas e higienização de
 * texto. Sem estado e sem dependência de nada — dá para testar isoladamente.
 */

const crypto = require('crypto');

/** Sem I, O, 0 e 1: ditar um convite por voz não pode dar errado. */
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const AVATAR_COLORS = [
  '#5865f2', '#3ba55c', '#faa61a', '#ed4245',
  '#eb459e', '#00a8fc', '#9b59b6', '#e67e22',
];

const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const uid = () => crypto.randomUUID();

function inviteCode(len = 8) {
  let out = '';
  for (const b of crypto.randomBytes(len)) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

/* -------------------------------------------------------------- senha --- */

/** scrypt do Node: sem dependência nativa, empacota bem no Electron. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password || ''), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  // Comparação em tempo constante: senão o tempo de resposta vaza o hash.
  if (check.length !== expected.length) return false;
  return crypto.timingSafeEqual(check, expected);
}

/* -------------------------------------------------------------- texto --- */

function isValidUsername(value) {
  return USERNAME_RE.test(String(value || ''));
}

/** Cor estável a partir do id: a mesma pessoa tem sempre o mesmo tom. */
function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Uma linha só, sem espaços repetidos, limitada — para nomes e títulos. */
function cleanText(value, max, fallback = '') {
  const s = String(value == null ? '' : value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return s || fallback;
}

/** Preserva quebras de linha — para bio e mensagens. */
function cleanMultiline(value, max) {
  return String(value == null ? '' : value).replace(/\r/g, '').slice(0, max).trim();
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * Só aceita imagens que nós mesmos validamos, nunca URL arbitrária.
 * Devolve `undefined` (e não `''`) quando o valor é inválido, para o chamador
 * distinguir "apagar a imagem" de "esse valor não serve".
 *
 * Aceita dois formatos: `/uploads/...` (uploads antigos, de quando a imagem
 * ia pro disco) e `/api/image/<id>` (formato atual — ver `http/routes.js`).
 * Note que NÃO aceita `data:` URL direto: um avatar de alguns MB embutido
 * assim em `user.avatar` viajaria inteiro em cada mensagem de socket que
 * incluísse esse usuário (login, presença, lista de membros...) e estoura o
 * `maxHttpBufferSize` do socket.io — por isso a imagem fica num registro à
 * parte (`db.images`), e só o id curto circula pelo resto do protocolo.
 */
function cleanAssetPath(value) {
  if (value === null || value === '') return '';
  if (typeof value !== 'string') return undefined;

  if (/^\/uploads\/[A-Za-z0-9_-]+\.(png|jpg|gif|webp)$/.test(value)) return value;
  if (/^\/api\/image\/[A-Za-z0-9-]+$/.test(value)) return value;

  return undefined;
}

module.exports = {
  AVATAR_COLORS,
  IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  uid,
  inviteCode,
  newToken,
  hashPassword,
  verifyPassword,
  isValidUsername,
  colorFor,
  cleanText,
  cleanMultiline,
  isHexColor,
  cleanAssetPath,
};
