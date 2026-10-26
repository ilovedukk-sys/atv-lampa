/** '#rrggbb' → 'rgba(r,g,b,a)'. Старые ТВ не понимают цвета вида #rrggbbaa. */
export function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ---------- цвет фона из кадра (как в tvOS 26: полки лежат на приглушённом цвете картинки) ----------

const tints: Record<string, Promise<string>> = {};

/** Средний цвет → спокойный фон: насыщенность ограничена, яркость одна для всех — белый текст читается. */
function calm(r: number, g: number, b: number) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  s = Math.max(0.08, Math.min(0.32, s * 0.75));
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, 30%)`;
}

export function calmHex(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return calm((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/**
 * Цвет фона по картинке: маленькая копия кадра (TMDB отдаёт картинки с CORS) сжимается до 16×9 точек
 * и усредняется. Один раз на картинку; если не вышло — fallback.
 */
export function tintOf(url: string | undefined, fallback: string): Promise<string> {
  if (!url) return Promise.resolve(fallback);
  if (!tints[url]) {
    tints[url] = new Promise((resolve) => {
      const pic = new Image();
      pic.crossOrigin = 'anonymous';
      pic.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 16;
          canvas.height = 9;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(pic, 0, 0, 16, 9);
          const data = ctx.getImageData(0, 0, 16, 9).data;
          let r = 0;
          let g = 0;
          let b = 0;
          for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
          }
          const n = data.length / 4;
          resolve(calm(r / n, g / n, b / n));
        } catch (e) {
          resolve(fallback);
        }
      };
      pic.onerror = () => resolve(fallback);
      pic.src = url;
    });
  }
  return tints[url];
}
