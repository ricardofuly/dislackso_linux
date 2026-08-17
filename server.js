'use strict';

/**
 * Ponto de entrada do servidor sozinho (modo web, sem o app desktop).
 * O app desktop usa server/index.js diretamente, no proprio processo.
 */

// Caminho explícito: "./server" resolveria para este próprio arquivo.
const { createServer } = require('./server/index.js');

const instance = createServer();

instance.listen().then(({ url, lan, scheme }) => {
  console.log('');
  console.log('  Discord2 no ar');
  console.log(`  local :  ${url}`);
  for (const addr of lan) console.log(`  rede  :  ${addr}`);
  if (scheme === 'http') {
    console.log('');
    console.log('  Aviso: compartilhar tela so funciona em localhost ou HTTPS.');
    console.log('  Para os amigos entrarem, use "npm run cert" (rede local) ou um tunel (internet).');
  }
  console.log('');
}).catch((err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${instance.port} ja esta em uso. Feche o outro Discord2 ou use PORT=3001 npm start\n`);
  } else {
    console.error('\n  Falha ao iniciar:', err.message, '\n');
  }
  process.exit(1);
});
