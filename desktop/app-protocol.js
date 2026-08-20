'use strict';

/**
 * Serve a interface compilada por um esquema próprio, `app://`.
 *
 * O PROBLEMA
 * O bundle usa módulos ES (`<script type="module">`), e o Chromium recusa
 * carregar módulo de `file://` — a origem é opaca, e a busca de módulo segue
 * regras de CORS. A janela abriria em branco, com um erro de CORS no console
 * e nenhuma pista melhor que isso.
 *
 * A SOLUÇÃO
 * Registrar um esquema declarado como padrão e seguro, com origem real
 * (`app://local`). Aí valem as mesmas regras de uma página https: módulos
 * carregam, `localStorage` persiste por origem, e o Service Worker e as APIs
 * de mídia funcionam sem afrouxar `webSecurity`.
 */

const path = require('path');
const { pathToFileURL } = require('url');
const { app, net, protocol } = require('electron');

const SCHEME = 'app';
const HOST = 'local';
const ORIGIN = `${SCHEME}://${HOST}`;

/** Precisa rodar antes de `app.whenReady()` — daí ficar separado de `serve`. */
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true, // dá origem de verdade, e com ela localStorage por origem
        secure: true, // conta como contexto seguro: getUserMedia e getDisplayMedia
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true,
      },
    },
  ]);
}

/**
 * Liga o esquema à pasta do build. Chame depois de `app.whenReady()`.
 * @param {string} root pasta do bundle (dist/desktop)
 */
function serve(root) {
  const base = path.resolve(root);

  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const decoded = decodeURIComponent(pathname);
    const target = path.join(base, decoded === '/' ? 'index.html' : decoded);

    // Sem esta checagem, `app://local/../../.ssh/id_rsa` leria qualquer
    // arquivo da máquina. `path.join` já normaliza o `..`; aqui conferimos
    // que o resultado continua dentro da pasta do build.
    if (target !== base && !target.startsWith(base + path.sep)) {
      return new Response('Not found', { status: 404 });
    }

    try {
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      // Caminho que não é arquivo: devolve o index, para o app decidir.
      return net.fetch(pathToFileURL(path.join(base, 'index.html')).toString());
    }
  });
}

/** A URL que a janela carrega. */
const indexUrl = () => `${ORIGIN}/index.html`;

/** Quando não há build, avisamos em vez de abrir uma janela em branco. */
function bundleExists(root) {
  try {
    return require('fs').existsSync(path.join(root, 'index.html'));
  } catch {
    return false;
  }
}

module.exports = { registerScheme, serve, indexUrl, bundleExists, ORIGIN, appPath: () => app.getAppPath() };
