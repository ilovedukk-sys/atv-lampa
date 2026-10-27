/**
 * Качество обложек: какого размера картинки просить у TMDB.
 * Меньше картинка — меньше трафика, памяти и работы для процессора слабого ТВ.
 * Выбор в «Настройках», запоминается.
 */
import type { ImageSize } from '../api/tmdb';
import { isUltra } from './lite';

export type Quality = 'low' | 'medium' | 'high';

interface Sizes {
  poster: ImageSize; // на экране 232×348
  landscape: ImageSize; // кадры на широких карточках и в сериях, на экране 400×225
  person: ImageSize; // фото актёров, на экране 180×180
  hero: ImageSize; // фон Top Shelf и экрана фильма, на экране 1920×1080
  logo: ImageSize; // логотип-название
}

const SIZES: Record<Quality, Sizes> = {
  low: { poster: 'w185', landscape: 'w300', person: 'w185', hero: 'w780', logo: 'w300' },
  medium: { poster: 'w342', landscape: 'w300', person: 'w185', hero: 'w1280', logo: 'w500' },
  high: { poster: 'w500', landscape: 'w780', person: 'w185', hero: 'w1280', logo: 'w500' },
};

export const QUALITY_LABELS: Record<Quality, string> = {
  low: 'Низкое',
  medium: 'Среднее',
  high: 'Высокое',
};

let quality: Quality = 'medium';
try {
  const saved = localStorage.getItem('quality') as Quality | null;
  if (saved && SIZES[saved]) quality = saved;
} catch (e) {
  /* по умолчанию — среднее */
}

export function getQuality() {
  return quality;
}

/*
 * Интерфейс в 720p (appinfo.json, resolution 1280x720): точек на экране в 1,5 раза меньше по стороне,
 * и постер 232×348 занимает 155×232 настоящих точки — большие картинки только зря распаковываются
 * и занимают видеопамять. Тогда постеры и кадры на ступень меньше; фон и логотип — как есть.
 */
const SMALL: Partial<Record<ImageSize, ImageSize>> = { w500: 'w342', w342: 'w185', w780: 'w300' };
const smallScreen = window.innerWidth <= 1280;

export function imageSizes(): Sizes {
  // Минимальный режим — всегда самые лёгкие картинки (настройка пользователя при этом не меняется)
  const s = SIZES[isUltra() ? 'low' : quality];
  if (!smallScreen) return s;
  const down = (v: ImageSize) => SMALL[v] || v;
  return { ...s, poster: down(s.poster), landscape: down(s.landscape) };
}

/** Следующий уровень по кругу: низкое → среднее → высокое → низкое. */
export function cycleQuality(): Quality {
  quality = quality === 'low' ? 'medium' : quality === 'medium' ? 'high' : 'low';
  try {
    localStorage.setItem('quality', quality);
  } catch (e) {
    /* без запоминания */
  }
  return quality;
}
