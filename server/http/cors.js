'use strict';

/**
 * CORS para a API HTTP (`/api/*`).
 *
 * O app desktop fala com este servidor a partir de uma origem diferente —
 * `app://local`, não `https://dislackso.onrender.com` — então toda chamada
 * é entre origens distintas por definição. Sem isto, o navegador bloqueia o
 * preflight e a requisição nunca chega a sair do cliente: upload de avatar,
 * banner e ícone de servidor simplesmente falham em silêncio.
 *
 * O Socket.IO já reflete qualquer origem (`cors: { origin: true }` em
 * server/index.js); esta função aplica a mesma política à parte da API que
 * usa `fetch` puro em vez de socket. Não há cookie de sessão nem
 * autenticação por origem aqui — a identidade viaja no corpo de cada
 * requisição — então refletir a origem sem exigir credenciais não abre
 * superfície nova de ataque.
 */
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

module.exports = { corsMiddleware };
