'use strict';

/**
 * Gera build/icon.png (512) e build/icon.ico (256) — usados pelo instalador,
 * pelo executável e pela janela.
 *
 * As duas fontes (build/icon-source-512.png e build/icon-source-256.png) já
 * vêm prontas — recortadas e com cantos arredondados transparentes — e ficam
 * versionadas no repositório. Este script só copia a de 512 e embrulha a de
 * 256 num contêiner .ico (que aceita um PNG inteiro dentro, sem precisar de
 * nenhuma biblioteca de imagem).
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'build');
const OUT_DIR = SRC_DIR;

/* -------------------------------------------------------------- ICO ---- */

/** ICO com uma única imagem PNG embutida (aceito desde o Windows Vista). */
function encodeIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reservado
  header.writeUInt16LE(1, 2);   // 1 = ícone
  header.writeUInt16LE(1, 4);   // uma imagem

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;   // 0 significa 256
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;                        // paleta
  entry[3] = 0;                        // reservado
  entry.writeUInt16LE(1, 4);           // planos
  entry.writeUInt16LE(32, 6);          // bits por pixel
  entry.writeUInt32BE(0, 8);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(6 + 16, 12);     // offset dos dados

  return Buffer.concat([header, entry, pngBuffer]);
}

/* ------------------------------------------------------------- saída --- */

fs.mkdirSync(OUT_DIR, { recursive: true });

const png512 = fs.readFileSync(path.join(SRC_DIR, 'icon-source-512.png'));
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png512);

const png256 = fs.readFileSync(path.join(SRC_DIR, 'icon-source-256.png'));
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), encodeIco(png256, 256));

console.log(`build/icon.png  512x512  ${(png512.length / 1024).toFixed(1)} KB`);
console.log(`build/icon.ico  256x256  ${((png256.length + 22) / 1024).toFixed(1)} KB`);
