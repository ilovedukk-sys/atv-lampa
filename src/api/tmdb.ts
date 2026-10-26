/**
 * Клиент TMDB (themoviedb.org): запросы, кеш, перевод ответов в наш формат (Item).
 *
 * Ключ берётся из файла .env.local (VITE_TMDB_KEY) — см. .env.example.
 * Подходит и короткий «API Key» (32 символа), и длинный «Read Access Token».
 * Если TMDB недоступен в сети — адреса можно заменить на прокси (VITE_TMDB_API_URL / VITE_TMDB_IMAGE_URL).
 */
import type { Item, Shelf } from '../data/types';

const API = (import.meta.env.VITE_TMDB_API_URL as string) || 'https://api.themoviedb.org/3';
const IMG = (import.meta.env.VITE_TMDB_IMAGE_URL as string) || 'https://image.tmdb.org/t/p';
const KEY = ((import.meta.env.VITE_TMDB_KEY as string) || '').trim();
const LANG = 'ru-RU';

export const hasTmdb = KEY.length > 0;

/** Размеры картинок подобраны под экран 1920×1080 и память слабого ТВ. */
export type ImageSize = 'w45' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280'; // w45 — только фото людей
export function img(path: string | undefined, size: ImageSize): string | undefined {
  return path ? `${IMG}/${size}${path}` : undefined;
}

// ---------- запросы и кеш ----------

const memory: Record<string, Promise<any>> = {};

function request<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  // Язык можно передать свой (биография актёра по-английски, если русской нет)
  const query: string[] = params.language ? [] : [`language=${LANG}`];
  for (const k in params) query.push(`${k}=${encodeURIComponent(String(params[k]))}`);
  const bearer = KEY.length > 40; // длинный токен — в заголовке, короткий ключ — в адресе
  if (!bearer) query.push(`api_key=${KEY}`);
  const url = `${API}${path}?${query.join('&')}`;

  if (!memory[url]) {
    memory[url] = fetch(url, bearer ? { headers: { Authorization: `Bearer ${KEY}` } } : undefined).then((r) => {
      if (!r.ok) throw new Error(`TMDB ${r.status}`);
      return r.json();
    });
    memory[url].catch(() => delete memory[url]); // ошибку не кешируем
  }
  return memory[url];
}

/**
 * Готовый (уже переведённый в наш формат) результат храним в localStorage телевизора:
 * при следующем запуске главная появляется мгновенно, без ожидания сети.
 */
async function cached<T>(key: string, hours: number, load: () => Promise<T>): Promise<T> {
  const storageKey = 'tmdb:' + key;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const entry = JSON.parse(raw);
      if (Date.now() - entry.t < hours * 3600e3) return entry.v as T;
    }
  } catch (e) {
    /* битая запись — загрузим заново */
  }
  const value = await load();
  const json = JSON.stringify({ t: Date.now(), v: value });
  try {
    localStorage.setItem(storageKey, json);
  } catch (e) {
    // Место кончилось — чистим старый кеш TMDB и пробуем ещё раз
    clearCache();
    try {
      localStorage.setItem(storageKey, json);
    } catch (e2) {
      /* без кеша */
    }
  }
  return value;
}

export function clearCache() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.indexOf('tmdb:') === 0) localStorage.removeItem(k);
  }
}

// ---------- перевод ответов TMDB в Item ----------

const genreNames: Record<number, string> = {};

export async function loadGenres() {
  if (genreNames[28]) return;
  const lists = await cached('genres', 24 * 7, async () => {
    const [m, t] = await Promise.all([
      request<any>('/genre/movie/list'),
      request<any>('/genre/tv/list'),
    ]);
    return m.genres.concat(t.genres) as { id: number; name: string }[];
  });
  lists.forEach((g) => (genreNames[g.id] = capitalize(g.name)));
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const PALETTE: [string, string][] = [
  ['#3d7ea6', '#081622'],
  ['#b0412f', '#1d0b07'],
  ['#d08b3a', '#2a1203'],
  ['#2f7d4f', '#08190f'],
  ['#6e4fb3', '#120a24'],
  ['#5b5f6b', '#06070a'],
];

/** Цвета заглушки из id — одинаковые при каждом запуске. */
export function colorsFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/** Жанры TMDB, по которым разводим вкладки: мультфильм, семейный, детский (сериалы). */
export const ANIMATION = 16;
export const FAMILY = 10751;
export const KIDS_TV = 10762;

/** Мультфильм, семейное или детское — для вкладки «Детям», а не «Фильмы»/«Сериалы». */
export function isForKids(item: Item) {
  return (item.genreIds || []).some((g) => g === ANIMATION || g === FAMILY || g === KIDS_TV);
}

export function yearOf(date?: string) {
  return date ? Number(date.slice(0, 4)) || undefined : undefined;
}

/** Фильм или сериал из любого списка TMDB → Item. */
export function toItem(r: any, type?: 'movie' | 'tv'): Item | null {
  const media = type || r.media_type;
  if (media !== 'movie' && media !== 'tv') return null;
  const id = `${media}:${r.id}`;
  const year = yearOf(r.release_date || r.first_air_date);
  const ids: number[] = r.genre_ids || (r.genres || []).map((g: any) => g.id);
  // Аниме и мультсериалы TMDB помечает жанром «Мультфильм» — у сериалов пишем «Мультсериал»
  const genre = ids.length ? (media === 'tv' && ids[0] === ANIMATION ? 'Мультсериал' : genreNames[ids[0]]) : '';
  return {
    id,
    tmdbId: r.id,
    kind: media === 'tv' ? 'show' : 'movie',
    title: r.title || r.name || '',
    originalTitle: r.original_title || r.original_name || undefined,
    meta: [genre, year].filter(Boolean).join(' · '),
    description: r.overview || '',
    colors: colorsFor(id),
    poster: r.poster_path || undefined,
    backdrop: r.backdrop_path || undefined,
    year,
    rating: r.vote_average || undefined,
    genreIds: ids.length ? ids.slice(0, 4) : undefined,
  };
}

function toItems(results: any[], type?: 'movie' | 'tv'): Item[] {
  const out: Item[] = [];
  results.forEach((r) => {
    const item = toItem(r, type);
    if (item) out.push(item);
  });
  return out;
}

/** Тип и номер TMDB из нашего id: 'tv:123' → ['tv', 123]. */
export function parseId(id: string): ['movie' | 'tv', number] | null {
  const m = /^(movie|tv):(\d+)$/.exec(id);
  return m ? [m[1] as 'movie' | 'tv', Number(m[2])] : null;
}

// ---------- списки ----------

/**
 * Название без русского перевода TMDB отдаёт в оригинале (корейский, японский…).
 * В подборках такие позиции пропускаем — в поиске оставляем.
 */
const FOREIGN_RANGES = [
  [0x0590, 0x08ff], // иврит, арабский
  [0x0900, 0x0dff], // языки Индии
  [0x0e00, 0x0e7f], // тайский
  [0x3040, 0x30ff], // японская кана
  [0x3400, 0x9fff], // китайские иероглифы
  [0xac00, 0xd7af], // корейский
];
const FOREIGN_SCRIPT = new RegExp(
  '[' + FOREIGN_RANGES.map((r) => String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1])).join('') + ']',
);
export function readable(item: Item) {
  return !FOREIGN_SCRIPT.test(item.title);
}

/** Любой список TMDB (популярное, тренды, жанр…) → Item[]. */
export async function list(path: string, params: Record<string, string | number> = {}, type?: 'movie' | 'tv') {
  await loadGenres();
  // v2 — в карточках появились жанры (genreIds); старый кеш без них не берём
  const key = 'v2' + path + JSON.stringify(params);
  return cached(key, 6, async () => {
    const data = await request<any>(path, params);
    return toItems(data.results || [], type).filter(readable);
  });
}

/** Страница списка без кеша в localStorage (для бесконечных сеток жанров). */
export async function listPage(path: string, params: Record<string, string | number>, type?: 'movie' | 'tv') {
  await loadGenres();
  const data = await request<any>(path, params);
  return { items: toItems(data.results || [], type).filter(readable), totalPages: data.total_pages as number };
}

/** Карточек на полке: больше слабому ТВ дорого, а всё остальное — в подборках жанров. */
const SHELF_LIMIT = 15;

export async function shelf(id: string, title: string, kind: Shelf['kind'], path: string, params = {}, type?: 'movie' | 'tv'): Promise<Shelf> {
  const items = await list(path, params, type);
  return { id, title, kind, items: items.slice(0, SHELF_LIMIT) };
}

/** Плитки жанров (фильмов или сериалов). */
export async function genreTiles(type: 'movie' | 'tv', ids: number[]): Promise<Item[]> {
  await loadGenres();
  return ids
    .filter((g) => genreNames[g])
    .map((g) => ({
      id: `genre:${type}:${g}`,
      title: genreNames[g],
      meta: '',
      colors: colorsFor('g' + g),
      genreId: g,
      kind: type === 'tv' ? ('show' as const) : ('movie' as const),
    }));
}

/** Логотип-название фильма (прозрачный PNG): сначала русский, потом английский. */
export async function logoFor(item: Item): Promise<string | undefined> {
  const parsed = parseId(item.id);
  if (!parsed) return undefined;
  return cached(`logo:${item.id}`, 24 * 7, async () => {
    const data = await request<any>(`/${parsed[0]}/${parsed[1]}/images`, { include_image_language: 'ru,en,null' });
    return pickLogo(data.logos || []);
  }).then((v) => v || undefined);
}

export function pickLogo(logos: any[]): string | null {
  const by = (lang: string | null) => logos.filter((l) => l.iso_639_1 === lang)[0];
  const logo = by('ru') || by('en') || by(null);
  return logo ? logo.file_path : null;
}

// ---------- поиск ----------

export async function search(query: string): Promise<Item[]> {
  await loadGenres();
  const data = await request<any>('/search/multi', { query, include_adult: 'false' });
  return toItems(data.results || []);
}

export { request, cached };
