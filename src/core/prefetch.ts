/**
 * Подготовка экрана фильма заранее: если на карточке фильма/сериала задержались,
 * тихо скачиваем его подробности (TMDB) и большой фон. Тогда по «ОК» экран открывается
 * сразу с картинкой — без чёрного фона и ожидания сети. Так же — страница актёра и его фото.
 * Фон фильма ещё и распаковывается заранее (core/predecode), чтобы открытие не ждало 100+ мс.
 */
import type { Item } from '../data/types';
import { hasTmdb, parseId } from '../api/tmdb';
import { loadDetails } from '../api/details';
import { loadPerson, parsePersonId } from '../api/person';
import { img } from '../api/tmdb';
import { photoFor } from '../components/Artwork';
import { onFocusChange } from './focus';
import { isUltra } from './lite';
import { predecode } from './predecode';

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
  if (!hasTmdb || !item) return;
  const person = parsePersonId(item.id) !== null;
  if (!person && !parseId(item.id)) return;
  timer = window.setTimeout(() => {
    if (!done[item.id]) {
      done[item.id] = true;
      (person ? loadPerson(item) : loadDetails(item)).catch(() => delete done[item.id]);
    }
    if (isUltra()) return;
    // Распаковку повторяем на каждой задержке: готовыми держим только две последние картинки
    if (!person) predecode(photoFor(item, 'hero'));
    else if (item.poster) new Image().src = img(item.poster, 'w300')!;
  }, DWELL_MS);
});
