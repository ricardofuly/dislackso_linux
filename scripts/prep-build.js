'use strict';

/**
 * Prepara o cache do electron-builder antes de empacotar.
 *
 * O PROBLEMA
 * O electron-builder baixa uma ferramenta de assinatura (winCodeSign) que é um
 * .7z contendo bibliotecas do macOS gravadas como links simbólicos. Criar link
 * simbólico no Windows exige um privilégio que uma conta comum não tem, então a
 * extração morre com:
 *
 *   ERROR: Cannot create symbolic link : A required privilege is not held
 *          by the client. : ...\darwin\10.12\lib\libcrypto.dylib
 *
 * O build inteiro falha por causa de dois arquivos do macOS que um build
 * Windows nunca vai usar.
 *
 * A SOLUÇÃO
 * Extrair o pacote nós mesmos, ignorando esses dois links, direto na pasta
 * final do cache. Quando o electron-builder for procurar, encontra pronto e
 * nem tenta baixar. Sem Modo Desenvolvedor, sem administrador.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SEVEN_ZIP = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
const APP_BUILDER = path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe');
const CACHE = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');

const FALLBACK_VERSION = '2.6.0';
const BASE_URL = 'https://github.com/electron-userland/electron-builder-binaries/releases/download';

// Se estes existirem, o cache está bom: são as ferramentas que o build usa.
const REQUIRED = ['rcedit-x64.exe', 'windows-10'];

if (process.platform !== 'win32') {
  console.log('prep-build: só é necessário no Windows, pulando.');
  process.exit(0);
}

/* ------------------------------------------------------------ helpers -- */

const ok = (dir) => REQUIRED.every((f) => fs.existsSync(path.join(dir, f)));

/** Pergunta ao app-builder qual versão ele quer, lendo a URL do log. */
function discoverVersion() {
  try {
    const out = execFileSync(APP_BUILDER, ['download-artifact', '--name', 'winCodeSign'], {
      env: { ...process.env, DEBUG: '*' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    const m = out.match(/winCodeSign-(\d+\.\d+\.\d+)/);
    if (m) return m[1];
  } catch (err) {
    // Esperado: sem o 7za no PATH ele baixa e falha na extração. O log serve.
    const text = String((err.stdout || '') + (err.stderr || ''));
    const m = text.match(/winCodeSign-(\d+\.\d+\.\d+)/);
    if (m) return m[1];
  }
  return FALLBACK_VERSION;
}

async function downloadArchive(version, dest) {
  const url = `${BASE_URL}/winCodeSign-${version}/winCodeSign-${version}.7z`;
  console.log(`  baixando ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download falhou: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Extrai tolerando os links simbólicos do macOS.
 * O 7za sai com código 2 por causa deles; tudo o mais é extraído normalmente,
 * então só falhamos se as ferramentas do Windows não aparecerem.
 */
function extract(archive, target) {
  fs.mkdirSync(target, { recursive: true });
  try {
    execFileSync(SEVEN_ZIP, ['x', '-bd', '-y', archive, `-o${target}`], { stdio: 'pipe' });
  } catch (err) {
    if (err.status !== 2) throw err;
    console.log('  (os dois links simbólicos do macOS foram ignorados, como esperado)');
  }
}

/* --------------------------------------------------------------- main -- */

(async () => {
  if (!fs.existsSync(SEVEN_ZIP)) {
    console.log('prep-build: 7zip-bin não encontrado, deixando o electron-builder tentar sozinho.');
    return;
  }

  fs.mkdirSync(CACHE, { recursive: true });

  // Já tem um cache bom? Nada a fazer.
  const existing = fs.readdirSync(CACHE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^winCodeSign-\d/.test(e.name))
    .map((e) => path.join(CACHE, e.name));
  if (existing.some(ok)) {
    console.log('prep-build: cache do winCodeSign já está pronto.');
    return;
  }

  const version = discoverVersion();
  const target = path.join(CACHE, `winCodeSign-${version}`);
  console.log(`prep-build: preparando winCodeSign-${version}…`);

  // O app-builder deixa o .7z na pasta mesmo quando a extração falha.
  let archive = fs.readdirSync(CACHE)
    .filter((f) => f.endsWith('.7z'))
    .map((f) => path.join(CACHE, f))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];

  if (!archive) {
    archive = path.join(CACHE, `winCodeSign-${version}.7z`);
    await downloadArchive(version, archive);
  }

  fs.rmSync(target, { recursive: true, force: true });
  extract(archive, target);

  if (!ok(target)) {
    console.error('prep-build: extração incompleta — as ferramentas do Windows não apareceram.');
    console.error('Ligue o Modo Desenvolvedor ou rode o build como administrador.');
    process.exit(1);
  }

  // Restos das tentativas que falharam antes: pastas e arquivos temporários.
  for (const entry of fs.readdirSync(CACHE, { withFileTypes: true })) {
    const full = path.join(CACHE, entry.name);
    if (full === target) continue;
    if (/^\d+$/.test(entry.name) || entry.name.endsWith('.7z')) {
      fs.rmSync(full, { recursive: true, force: true });
    }
  }

  console.log(`prep-build: pronto em ${target}`);
})().catch((err) => {
  console.error('prep-build falhou:', err.message);
  process.exit(1);
});
