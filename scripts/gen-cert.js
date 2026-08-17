'use strict';

/**
 * Gera um certificado auto-assinado em ./certs para o servidor subir em HTTPS.
 * Necessario porque navegadores so liberam getDisplayMedia (captura de tela)
 * em "contexto seguro": localhost ou HTTPS.
 *
 * O certificado cobre localhost, 127.0.0.1 e todos os IPs de rede local da
 * maquina, entao os amigos na mesma rede conseguem acessar.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');

const CERT_DIR = path.join(__dirname, '..', 'certs');
fs.mkdirSync(CERT_DIR, { recursive: true });

const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address);

const altNames = [
  { type: 2, value: 'localhost' },
  { type: 7, ip: '127.0.0.1' },
  ...ips.map((ip) => ({ type: 7, ip })),
];

const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
  days: 3650,
  keySize: 2048,
  algorithm: 'sha256',
  extensions: [{ name: 'subjectAltName', altNames }],
});

fs.writeFileSync(path.join(CERT_DIR, 'key.pem'), pems.private);
fs.writeFileSync(path.join(CERT_DIR, 'cert.pem'), pems.cert);

console.log('Certificado criado em ./certs');
console.log('Valido para: localhost, 127.0.0.1' + (ips.length ? ', ' + ips.join(', ') : ''));
console.log('Rode "npm start" — o servidor vai subir em HTTPS automaticamente.');
console.log('O navegador vai avisar que o certificado nao e confiavel: clique em');
console.log('"Avancado" e depois "Prosseguir". Isso e esperado num certificado proprio.');
