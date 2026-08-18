'use strict';

/**
 * Os servidores de STUN e TURN que os clientes usam para se encontrar.
 *
 * O TURN público (Open Relay) é best-effort e existe para cobrir quem está
 * atrás de CGNAT ou NAT simétrico — comum em internet via rádio, 4G e 5G,
 * onde a conexão direta simplesmente não fecha. As portas 443, inclusive por
 * TCP, ajudam em redes que bloqueiam UDP.
 *
 * Para um grupo que depende disso o tempo todo, configure um TURN próprio
 * (TURN_URL / TURN_USER / TURN_PASS) — ver DEPLOY.md.
 */

const PUBLIC_STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
];

const OPEN_RELAY = ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp']
  .map((urls) => ({ urls, username: 'openrelayproject', credential: 'openrelayproject' }));

function buildIceServers(options = {}) {
  const servers = [{ urls: PUBLIC_STUN }, ...OPEN_RELAY];

  const turnUrl = options.turnUrl || process.env.TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: String(turnUrl).split(',').map((s) => s.trim()).filter(Boolean),
      username: options.turnUser || process.env.TURN_USER || '',
      credential: options.turnPass || process.env.TURN_PASS || '',
    });
  }
  return servers;
}

module.exports = { buildIceServers };
