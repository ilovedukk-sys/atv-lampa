/**
 * Рисует «обложку»-заглушку в маленькую картинку (canvas → PNG) один раз и кеширует.
 *
 * Зачем: на webOS 4 браузер рисует CSS-градиенты медленно, а растягивает готовую
 * картинку почти бесплатно. Градиенты размытые, поэтому низкое разрешение незаметно.
 * На этапе 4 вместо этого будут настоящие постеры из TMDB — тоже картинки.
 */
import { rgba } from './color';

export type ArtVariant = 'landscape' | 'poster' | 'genre' | 'hero' | 'episode' | 'person';

// Размеры подобраны замером на webOS 4: меньше пикселей — быстрее рисуется и кодируется,
// а размытые градиенты при растягивании выглядят так же
const SIZES: Record<ArtVariant, [number, number]> = {
  hero: [384, 216], // на экране 1920×1080
  landscape: [160, 90], // на экране 400×225
  poster: [96, 144], // на экране 232×348
  genre: [120, 68], // на экране 300×170
  episode: [160, 90], // на экране 400×225
  person: [64, 64], // на экране 180×180 (круг)
};

let cache: Record<string, string> = {};

/** Статистика для замера плавности: сколько картинок нарисовано и за сколько мс. */
export const artStats = { count: 0, ms: 0 };
export function clearArtCache() {
  cache = {};
}

export function artImage(id: string, colors: [string, string], variant: ArtVariant): string {
  const key = id + ':' + variant;
  if (cache[key]) return cache[key];

  const started = performance.now();
  const [w, h] = SIZES[variant];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const [a, b] = colors;

  // Основной градиент под углом 160°, как было в CSS
  const angle = (160 * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const lin = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
  lin.addColorStop(0, a);
  lin.addColorStop(0.78, b);
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, w, h);

  const radial = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  const diag = Math.sqrt(w * w + h * h);
  radial(w * 0.78, h * 0.22, diag * 0.55, a, 0.95); // свечение справа сверху
  radial(w * 0.1, h * 1.1, diag * 0.5, a, 0.45); // подсветка слева снизу
  radial(w * 0.8, h * 0.05, w * 0.3, '#ffffff', 0.3); // блик-«сфера»

  if (variant === 'hero') {
    // Затемнение под текст вшито прямо в картинку — отдельный полноэкранный слой не нужен
    const left = ctx.createLinearGradient(0, 0, w, 0);
    left.addColorStop(0, 'rgba(0,0,0,0.75)');
    left.addColorStop(0.45, 'rgba(0,0,0,0.35)');
    left.addColorStop(0.7, 'rgba(0,0,0,0)');
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, w, h);
    const down = ctx.createLinearGradient(0, 0, 0, h);
    down.addColorStop(0, 'rgba(0,0,0,0.35)');
    down.addColorStop(0.22, 'rgba(0,0,0,0)');
    down.addColorStop(0.55, 'rgba(0,0,0,0)');
    down.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = down;
    ctx.fillRect(0, 0, w, h);
  }

  // JPEG кодируется заметно быстрее PNG на слабом процессоре ТВ (прозрачность не нужна)
  cache[key] = canvas.toDataURL('image/jpeg', 0.85);
  artStats.count++;
  artStats.ms += performance.now() - started;
  return cache[key];
}
