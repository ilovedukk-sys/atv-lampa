/**
 * Трейлеры играет родное приложение YouTube телевизора: оно умеет HD и аппаратное декодирование,
 * а встроить плеер YouTube в приложение, открытое с диска (file://), YouTube не разрешает.
 *
 * На слабом ТВ памяти на YouTube и наше приложение сразу не хватает — webOS закрывает наше.
 * Поэтому перед запуском запоминаем экран фильма, и при следующем открытии возвращаемся на него.
 */
import type { Item } from '../data/types';
import type { Trailer } from '../data/details';
import { hasWebOS, launchApp } from './webos';

const YOUTUBE_APP = 'youtube.leanback.v4';
const RETURN_KEY = 'returnTo';
const RETURN_MAX_MS = 30 * 60 * 1000; // вернулись позже получаса — открываем обычную главную

export function playTrailer(t: Trailer, from: Item): Promise<void> {
  if (!hasWebOS()) {
    // На компьютере — просто вкладка с роликом
    window.open(`https://www.youtube.com/watch?v=${t.key}`, '_blank');
    return Promise.resolve();
  }
  try {
    localStorage.setItem(RETURN_KEY, JSON.stringify({ item: from, at: Date.now() }));
  } catch (e) {
    /* без возврата */
  }
  return launchApp(YOUTUBE_APP, { contentTarget: `https://www.youtube.com/tv?v=${t.key}` }).then(
    () => undefined,
    (e) => {
      forgetReturn();
      throw new Error(/not.?found|exist/i.test(e.message) ? 'Для трейлеров нужно приложение YouTube' : 'Не удалось открыть YouTube');
    },
  );
}

/** Фильм, с которого ушли смотреть трейлер (если приложение закрылось и открыто заново). */
export function takeReturn(): Item | null {
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    forgetReturn();
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return Date.now() - saved.at < RETURN_MAX_MS ? (saved.item as Item) : null;
  } catch (e) {
    return null;
  }
}

function forgetReturn() {
  try {
    localStorage.removeItem(RETURN_KEY);
  } catch (e) {
    /* нечего */
  }
}

// Вернулись из YouTube, а приложение не закрывалось — экран и так на месте, запоминать нечего
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) forgetReturn();
});

/** Кадр ролика для карточки (320×180 — легко для слабого ТВ). */
export function trailerImage(t: Trailer) {
  return `https://i.ytimg.com/vi/${t.key}/mqdefault.jpg`;
}

const LANGS: Record<string, string> = { ru: 'Русский', en: 'Английский' };

export function trailerMeta(t: Trailer) {
  return [LANGS[t.lang] || t.lang.toUpperCase(), t.type === 'Teaser' ? 'тизер' : 'трейлер'].join(' · ');
}
