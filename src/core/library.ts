/**
 * Медиатека: фильмы и сериалы, добавленные кнопкой «+».
 * Храним сами карточки (название, постер…), чтобы вкладка «Медиатека» открывалась без сети.
 * Лежит в localStorage телевизора, переживает перезапуск приложения.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Item } from '../data/types';

const KEY = 'library2';
const listeners = new Set<() => void>();

function load(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch (e) {
    return [];
  }
}

let items: Item[] = load();

export function inLibrary(id: string) {
  return items.some((x) => x.id === id);
}

export function libraryItems() {
  return items;
}

/** Добавить или убрать. Возвращает true, если теперь в медиатеке. */
export function toggleLibrary(item: Item) {
  if (inLibrary(item.id)) {
    items = items.filter((x) => x.id !== item.id);
  } else {
    // Только нужные поля — без прогресса и прочего
    const saved: Item = {
      id: item.id,
      title: item.title,
      kind: item.kind,
      meta: item.meta,
      description: item.description,
      colors: item.colors,
      tmdbId: item.tmdbId,
      poster: item.poster,
      backdrop: item.backdrop,
      year: item.year,
      rating: item.rating,
    };
    items = [saved].concat(items); // новые — первыми
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch (e) {
    /* без localStorage — только до перезапуска */
  }
  listeners.forEach((fn) => fn());
  return inLibrary(item.id);
}

/** Подписка на изменения медиатеки (для перерисовки). */
export function useLibraryVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const fn = () => setV((x) => x + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return v;
}

/** Хук для кнопки «+» / «✓». */
export function useInLibrary(id: string) {
  useLibraryVersion();
  return inLibrary(id);
}
