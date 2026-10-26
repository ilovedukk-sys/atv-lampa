/**
 * Подготовка экрана фильма заранее: если на карточке фильма/сериала задержались,
 * тихо скачиваем его подробности (TMDB) и большой фон. Тогда по «ОК» экран открывается
 * сразу с картинкой — без чёрного фона и ожидания сети.
 * Картинка только скачивается в кеш браузера (не распаковывается) — память не тратится.
 */
import type { Item } from '../data/types';
import { hasTmdb, parseId } from '../api/tmdb';
import { loadDetails } from '../api/details';
import { photoFor } from '../components/Artwork';
import { onFocusChange } from './focus';
import { isUltra } from './lite';

const DWELL_MS = 700; // задержались на карточке дольше — скорее всего, откроют
const items = new WeakMap<Element, Item>();
const done: Record<string, true> = {};
let timer = 0;

/** Карточка сообщает, какой фильм за ней стоит. */
export function registerCard(el: Element, item: Item) {
  items.set(el, item);
}

onFocusChange((el) => {
  clearTimeout(timer);
  const item = items.get(el);
  if (!hasTmdb || !item || done[item.id] || !parseId(item.id)) return;
  timer = window.setTimeout(() => {
    done[item.id] = true;
    loadDetails(item).catch(() => delete done[item.id]);
    const backdrop = photoFor(item, 'hero');
    if (backdrop && !isUltra()) new Image().src = backdrop;
  }, DWELL_MS);
});
