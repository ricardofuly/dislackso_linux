'use strict';

/**
 * Gera build/icon.png (512) e build/icon.ico (256) — usados pelo instalador,
 * pelo executável e pela janela.
 *
 * Escrito na mão para não trazer nenhuma dependência de imagem só por isso.
 * O .ico é um contêiner que aceita um PNG inteiro dentro, então dá para
 * reaproveitar o mesmo codificador.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'build');
const BLURPLE = [88, 101, 242];
const WHITE = [255, 255, 255];

/* ----------------------------------------------------------- desenho --- */

/** Desenha o ícone num buffer RGBA do tamanho pedido. */
function draw(size) {
  const px = new Uint8Array(size * size * 4);
  const u = size / 512; // as medidas abaixo estão em unidades de 512

  function set(x, y, [r, g, b], a) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const src = a / 255;
    const dstA = px[i + 3] / 255;
    const outA = src + dstA * (1 - src);
    if (outA === 0) return;
    px[i]     = Math.round((r * src + px[i]     * dstA * (1 - src)) / outA);
    px[i + 1] = Math.round((g * src + px[i + 1] * dstA * (1 - src)) / outA);
    px[i + 2] = Math.round((b * src + px[i + 2] * dstA * (1 - src)) / outA);
    px[i + 3] = Math.round(outA * 255);
  }

  /** Retângulo de cantos arredondados, com antisserrilhado por supersample. */
  function roundRect(rx, ry, rw, rh, radius, color) {
    const x0 = rx * u, y0 = ry * u, x1 = (rx + rw) * u, y1 = (ry + rh) * u, r = radius * u;
    const N = 4;
    for (let y = Math.floor(y0) - 1; y <= Math.ceil(y1) + 1; y++) {
      for (let x = Math.floor(x0) - 1; x <= Math.ceil(x1) + 1; x++) {
        let hits = 0;
        for (let sy = 0; sy < N; sy++) {
          for (let sx = 0; sx < N; sx++) {
            const fx = x + (sx + 0.5) / N;
            const fy = y + (sy + 0.5) / N;
            if (fx < x0 || fx > x1 || fy < y0 || fy > y1) continue;
            const cx = fx < x0 + r ? x0 + r : fx > x1 - r ? x1 - r : fx;
            const cy = fy < y0 + r ? y0 + r : fy > y1 - r ? y1 - r : fy;
            const dx = fx - cx, dy = fy - cy;
            if (dx * dx + dy * dy <= r * r) hits++;
          }
        }
        if (hits) set(x, y, color, Math.round((hits / (N * N)) * 255));
      }
    }
  }

  roundRect(0, 0, 512, 512, 120, BLURPLE);     // fundo
  roundRect(112, 152, 288, 184, 26, WHITE);     // monitor
  roundRect(140, 182, 232, 124, 10, BLURPLE);   // tela
  roundRect(216, 348, 80, 26, 13, WHITE);       // pé
  roundRect(186, 224, 74, 14, 7, WHITE);        // "conteúdo"
  roundRect(186, 252, 130, 14, 7, WHITE);
  roundRect(186, 280, 96, 14, 7, WHITE);

  return px;
}

/* -------------------------------------------------------------- PNG ---- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(px, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // filtro adaptativo
  ihdr[12] = 0;  // sem entrelaçamento

  // Cada linha começa com o byte de filtro (0 = nenhum).
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

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

const png512 = encodePng(draw(512), 512);
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), png512);

const png256 = encodePng(draw(256), 256);
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), encodeIco(png256, 256));

console.log(`build/icon.png  512x512  ${(png512.length / 1024).toFixed(1)} KB`);
console.log(`build/icon.ico  256x256  ${((png256.length + 22) / 1024).toFixed(1)} KB`);
