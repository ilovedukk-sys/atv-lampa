/**
 * Качество обложек: какого размера картинки просить у TMDB.
 * Меньше картинка — меньше трафика, памяти и работы для процессора слабого ТВ.
 * Выбор в «Настройках», запоминается.
 */
import type { ImageSize } from '../api/tmdb';

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

export function imageSizes(): Sizes {
  return SIZES[quality];
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
