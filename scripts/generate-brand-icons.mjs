#!/usr/bin/env node
// Genere les icones d'AfriVox (favicon SVG, favicon.ico, icones de la PWA) a partir du logo du composant
// src/app/core/ui/brand-mark.ts : cinq barres, comme une onde sonore.
//
// Usage (depuis la racine du depot frontend) : node scripts/generate-brand-icons.mjs
// Aucune dependance : le PNG est ecrit a la main (zlib de Node) avec un lissage par sur-echantillonnage.
// Si le logo ou la palette change, mettre a jour BARS / TILE ci-dessous (memes valeurs que brand-mark.ts et
// src/styles.scss) puis relancer.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// x, y, largeur, hauteur (unites du logo, viewBox 40x40), rayon 2,5 ; couleurs de src/styles.scss
const BARS = [
  { x: 3, y: 14, w: 5, h: 12, color: '#d9a12a' }, // --afv-gold
  { x: 11, y: 7, w: 5, h: 26, color: '#c4411a' }, // --afv-accent (terracotta)
  { x: 19, y: 2, w: 5, h: 36, color: '#1e2a6b' }, // --afv-brand (indigo)
  { x: 27, y: 9, w: 5, h: 22, color: '#c4411a' },
  { x: 35, y: 15, w: 5, h: 10, color: '#d9a12a' },
];
const BAR_RADIUS = 2.5;
const TILE = '#fbf5ea'; // fond creme du manifeste (background_color)

// Boite englobante du logo : le logo n'est pas centre dans son viewBox, on le recentre.
const BOX = { x0: 3, x1: 40, y0: 2, y1: 38 };
const BOX_W = BOX.x1 - BOX.x0;
const CX = (BOX.x0 + BOX.x1) / 2;
const CY = (BOX.y0 + BOX.y1) / 2;

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Point (px, py) dans le rectangle arrondi (x, y, w, h, r) ? */
function inside(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const dx = Math.max(x + r - px, 0, px - (x + w - r));
  const dy = Math.max(y + r - py, 0, py - (y + h - r));
  return dx * dx + dy * dy <= r * r;
}

/**
 * Image RGBA size x size. `markRatio` = part de la largeur occupee par le logo ; `corner` = rayon de la
 * tuile en part de la taille (0 = carre plein, utile pour les icones « maskable »).
 */
function render(size, markRatio, corner) {
  const k = (size * markRatio) / BOX_W; // pixels par unite du logo
  const ss = size <= 64 ? 8 : 4; // sur-echantillonnage
  const buf = Buffer.alloc(size * size * 4);
  const tile = hex(TILE);
  const bars = BARS.map((b) => ({ ...b, rgb: hex(b.color) }));
  const r = corner * size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = px + (sx + 0.5) / ss;
          const y = py + (sy + 0.5) / ss;
          if (corner > 0 ? !inside(x, y, 0, 0, size, size, r) : false) continue; // hors tuile : transparent
          let c = tile;
          const u = (x - size / 2) / k + CX;
          const v = (y - size / 2) / k + CY;
          for (const b of bars) {
            if (inside(u, v, b.x, b.y, b.w, b.h, BAR_RADIUS)) {
              c = b.rgb;
              break;
            }
          }
          rr += c[0];
          gg += c[1];
          bb += c[2];
          aa += 1;
        }
      }
      const i = (py * size + px) * 4;
      const n = ss * ss;
      if (aa > 0) {
        buf[i] = Math.round(rr / aa);
        buf[i + 1] = Math.round(gg / aa);
        buf[i + 2] = Math.round(bb / aa);
        buf[i + 3] = Math.round((255 * aa) / n);
      }
    }
  }
  return buf;
}

// ---- PNG ----------------------------------------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtre « aucun »
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO avec des PNG integres (pris en charge par tous les navigateurs recents). */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2); // type : icone
  head.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // plans
    e.writeUInt16LE(32, 6); // bits par pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([head, ...entries, ...images.map((i) => i.data)]);
}

// ---- SVG ----------------------------------------------------------------------------------------------------------
function svg(markRatio, corner) {
  const S = 64;
  const k = (S * markRatio) / BOX_W;
  const tx = S / 2 - CX * k;
  const ty = S / 2 - CY * k;
  const rects = BARS.map(
    (b) => `    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${BAR_RADIUS}" fill="${b.color}"/>`,
  ).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <title>AfriVox</title>
  <rect width="${S}" height="${S}" rx="${(corner * S).toFixed(1)}" fill="${TILE}"/>
  <g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${k.toFixed(4)})">
${rects}
  </g>
</svg>
`;
}

// ---- Sortie -------------------------------------------------------------------------------------------------------
const out = 'public';
mkdirSync(join(out, 'icons'), { recursive: true });

// Favicon : tuile arrondie, logo grand pour rester lisible a 16 px
writeFileSync(join(out, 'favicon.svg'), svg(0.78, 0.22));
writeFileSync(
  join(out, 'favicon.ico'),
  ico([16, 32, 48].map((size) => ({ size, data: png(size, render(size, 0.78, 0.22)) }))),
);

// Icones PWA : declarees « maskable any » dans le manifeste. Carre plein (le systeme applique son masque) et
// logo dans la zone de securite (60 % de la largeur) pour ne jamais etre rogne.
for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
  writeFileSync(join(out, 'icons', `icon-${size}x${size}.png`), png(size, render(size, 0.6, 0)));
}
console.log('Ecrit : public/favicon.svg, public/favicon.ico, public/icons/icon-*.png');
