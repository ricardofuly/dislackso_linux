'use strict';

/**
 * Monta uma versão portátil em dist/Discord2-portable — uma pasta que roda
 * direto, sem instalador e sem privilégio de administrador.
 *
 * Existe porque o instalador do electron-builder precisa criar links
 * simbólicos no Windows, o que exige Modo Desenvolvedor ou admin. Este
 * caminho é só cópia de arquivo, então funciona sempre. Para gerar o
 * instalador .exe de verdade, veja o README.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT = path.join(ROOT, 'dist', 'Discord2-portable');
const APP = path.join(OUT, 'resources', 'app');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

if (!fs.existsSync(ELECTRON_DIST)) {
  console.error('Electron não encontrado. Rode "npm install" primeiro.');
  process.exit(1);
}

/* ------------------------------------------------------------ helpers -- */

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (skip(src, entry)) continue;
    if (entry.isDirectory()) copyDir(src, dst, skip);
    else if (entry.isFile()) fs.copyFileSync(src, dst);
    // links simbólicos são ignorados de propósito: é justamente o que trava
    // o build oficial no Windows sem Modo Desenvolvedor
  }
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(p);
    else if (entry.isFile()) total += fs.statSync(p).size;
  }
  return total;
}

/**
 * Resolve, a partir das dependências de produção, tudo que precisa ir junto.
 * O npm achata o node_modules, então basta caminhar pelos package.json.
 */
function productionDeps() {
  const found = new Set();
  const queue = Object.keys(pkg.dependencies || {});

  while (queue.length) {
    const name = queue.shift();
    if (found.has(name)) continue;
    const dir = path.join(ROOT, 'node_modules', name);
    if (!fs.existsSync(dir)) {
      console.warn(`  aviso: dependência ausente em node_modules: ${name}`);
      continue;
    }
    found.add(name);
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      queue.push(...Object.keys(meta.dependencies || {}));
    } catch { /* pacote sem package.json legível: copia mesmo assim */ }
  }
  return [...found];
}

/* -------------------------------------------------------------- passos - */

console.log('Limpando saída anterior…');
fs.rmSync(OUT, { recursive: true, force: true });

console.log('Copiando runtime do Electron…');
copyDir(ELECTRON_DIST, OUT);

// A pasta default_app é o "app de exemplo" do Electron; sai fora.
fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });

console.log('Copiando o aplicativo…');
for (const dir of ['desktop', 'server', 'public']) {
  copyDir(path.join(ROOT, dir), path.join(APP, dir));
}

// package.json enxuto: sem devDependencies nem config de build.
fs.mkdirSync(APP, { recursive: true });
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({
  name: pkg.name,
  productName: 'Discord2',
  version: pkg.version,
  description: pkg.description,
  main: pkg.main,
  dependencies: pkg.dependencies,
}, null, 2));

console.log('Copiando dependências de produção…');
const deps = productionDeps();
for (const name of deps) {
  copyDir(path.join(ROOT, 'node_modules', name), path.join(APP, 'node_modules', name));
}
console.log(`  ${deps.length} pacotes`);

console.log('Renomeando o executável…');
const exeFrom = path.join(OUT, 'electron.exe');
const exeTo = path.join(OUT, 'Discord2.exe');
if (fs.existsSync(exeFrom)) fs.renameSync(exeFrom, exeTo);

/* Ícone: usa o rcedit do cache do electron-builder, se estiver por perto. */
const ico = path.join(ROOT, 'build', 'icon.ico');
if (fs.existsSync(ico)) {
  const cache = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');
  let rcedit = null;
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache)) {
      const candidate = path.join(cache, d, 'rcedit-x64.exe');
      if (fs.existsSync(candidate)) { rcedit = candidate; break; }
    }
  }
  if (rcedit) {
    try {
      execFileSync(rcedit, [exeTo, '--set-icon', ico], { stdio: 'ignore' });
      console.log('Ícone aplicado ao executável.');
    } catch {
      console.log('Não consegui aplicar o ícone (segue com o padrão do Electron).');
    }
  } else {
    console.log('rcedit não encontrado — o .exe fica com o ícone padrão do Electron.');
  }
}

/* Atalho de conveniência para quem só quer clicar. */
fs.writeFileSync(path.join(OUT, 'Abrir Discord2.bat'),
  '@echo off\r\nstart "" "%~dp0Discord2.exe"\r\n');

fs.writeFileSync(path.join(OUT, 'LEIA-ME.txt'),
  [
    'Discord2 — versão portátil',
    '',
    'Rode Discord2.exe (ou "Abrir Discord2.bat").',
    'Não precisa instalar nada.',
    '',
    'Na primeira tela, escolha:',
    '  Hospedar aqui  - seu PC vira o servidor',
    '  Conectar       - cole o link que seu amigo mandou',
    '',
    'Pode copiar esta pasta inteira para um pendrive ou mandar zipada.',
  ].join('\r\n'));

const mb = (dirSize(OUT) / 1024 / 1024).toFixed(0);
console.log('');
console.log(`Pronto: dist/Discord2-portable (${mb} MB)`);
console.log('Rode dist/Discord2-portable/Discord2.exe ou zipe a pasta e mande para os amigos.');
