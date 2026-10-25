/**
 * Рисует иконки приложения для webOS (public/icon.png 80×80 и public/largeIcon.png 130×130)
 * без сторонних библиотек: тёмный скруглённый квадрат с белым треугольником «Play».
 * Запуск: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SS = 4; // сглаживание: считаем каждый пиксель по 4×4 точкам

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 бит, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Точка (u, v) в координатах 0..1 → цвет [r, g, b, a] (0..1). */
function shade(u, v) {
  // скруглённый квадрат
  const r = 0.22;
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];

  // треугольник Play
  const ax = 0.4, ay = 0.3, bx = 0.4, by = 0.7, cx = 0.72, cy = 0.5;
  const s1 = (bx - ax) * (v - ay) - (by - ay) * (u - ax);
  const s2 = (cx - bx) * (v - by) - (cy - by) * (u - bx);
  const s3 = (ax - cx) * (v - cy) - (ay - cy) * (u - cx);
  if ((s1 <= 0 && s2 <= 0 && s3 <= 0) || (s1 >= 0 && s2 >= 0 && s3 >= 0)) return [1, 1, 1, 1];

  // фон: вертикальный градиент графитового цвета
  const t = v;
  return [0.2 - 0.15 * t, 0.2 - 0.15 * t, 0.23 - 0.17 * t, 1];
}

function icon(size) {
  return png(size, (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < SS; i++)
      for (let j = 0; j < SS; j++) {
        const c = shade((x + (i + 0.5) / SS) / size, (y + (j + 0.5) / SS) / size);
        r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
      }
    if (a === 0) return [0, 0, 0, 0];
    return [Math.round((r / a) * 255), Math.round((g / a) * 255), Math.round((b / a) * 255), Math.round((a / (SS * SS)) * 255)];
  });
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon.png', icon(80));
writeFileSync('public/largeIcon.png', icon(130));
console.log('Готово: public/icon.png, public/largeIcon.png');
