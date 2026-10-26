/**
 * Что показывать на вкладках «Главная», «Фильмы», «Сериалы», «Детям».
 * С ключом TMDB — настоящие подборки, без ключа — временные данные.
 */
import type { Item, Page, Shelf } from './types';
import { genreTiles, hasTmdb, isForKids, list, logoFor, shelf } from '../api/tmdb';
import { heroItems, shelves as mockShelves } from './mock';

export type BrowseTab = 'home' | 'movies' | 'shows' | 'kids';

// Жанры TMDB, которые показываем плитками и отдельными полками
const MOVIE_GENRES = [28, 35, 18, 878, 53, 27, 16, 10751, 80, 99, 12, 14];
const TV_GENRES = [18, 35, 80, 10765, 9648, 16, 99, 10759];

/** Полки, которые не удалось загрузить, просто пропускаем. */
async function collect(loaders: Promise<Shelf>[]): Promise<Shelf[]> {
  const settled = await Promise.all(loaders.map((p) => p.then((s) => s, () => null)));
  return settled.filter((s): s is Shelf => !!s && s.items.length > 0);
}

const HERO_COUNT = 6;

/**
 * Слайды Top Shelf. Во «Фильмах» — только фильмы, в «Сериалах» — только сериалы, и без мультфильмов
 * и детского (для них своя вкладка «Детям»). Если в трендах таких мало — добираем из популярного.
 */
async function heroFrom(paths: string[], opts: { type?: 'movie' | 'tv'; noKids?: boolean; params?: object } = {}) {
  const lists = await Promise.all(paths.map((p) => list(p, (opts.params || {}) as Record<string, string | number>, opts.type).catch(() => [] as Item[])));
  const seen: Record<string, true> = {};
  const out: Item[] = [];
  ([] as Item[]).concat(...lists).forEach((i) => {
    if (out.length >= HERO_COUNT || seen[i.id] || !i.backdrop || !i.description) return;
    if (opts.type && i.kind !== (opts.type === 'tv' ? 'show' : 'movie')) return;
    if (opts.noKids && isForKids(i)) return;
    seen[i.id] = true;
    out.push(i);
  });
  return out;
}

// Только то, что подходит детям: американский рейтинг не старше PG (6+)
const KIDS_MOVIE = { 'certification_country': 'US', 'certification.lte': 'PG', sort_by: 'popularity.desc' };

const pages: Record<string, Promise<Page>> = {};

export function loadPage(tab: BrowseTab): Promise<Page> {
  if (!hasTmdb) {
    return Promise.resolve(tab === 'home' ? { hero: heroItems, shelves: mockShelves } : { hero: [], shelves: [] });
  }
  if (!pages[tab]) {
    pages[tab] = buildPage(tab);
    pages[tab].catch(() => delete pages[tab]);
  }
  return pages[tab];
}

async function buildPage(tab: BrowseTab): Promise<Page> {
  if (tab === 'movies') {
    const [hero, shelves] = await Promise.all([
      heroFrom(['/trending/movie/week', '/movie/popular'], { type: 'movie', noKids: true }),
      collect([
        shelf('m-popular', 'Популярные фильмы', 'poster', '/movie/popular', {}, 'movie'),
        shelf('m-now', 'Сейчас в кино', 'landscape', '/movie/now_playing', {}, 'movie'),
        shelf('m-top', 'Лучшие за всё время', 'poster', '/movie/top_rated', {}, 'movie'),
        genreTiles('movie', MOVIE_GENRES).then((items) => ({ id: 'm-genres', title: 'Жанры', kind: 'genre' as const, items })),
        shelf('m-upcoming', 'Скоро', 'landscape', '/movie/upcoming', {}, 'movie'),
        shelf('m-action', 'Боевики', 'poster', '/discover/movie', { with_genres: 28, sort_by: 'popularity.desc' }, 'movie'),
        shelf('m-comedy', 'Комедии', 'poster', '/discover/movie', { with_genres: 35, sort_by: 'popularity.desc' }, 'movie'),
        shelf('m-anim', 'Мультфильмы', 'poster', '/discover/movie', { with_genres: 16, sort_by: 'popularity.desc' }, 'movie'),
      ]),
    ]);
    return { hero, shelves };
  }

  if (tab === 'shows') {
    const [hero, shelves] = await Promise.all([
      heroFrom(['/trending/tv/week', '/tv/popular'], { type: 'tv', noKids: true }),
      collect([
        shelf('t-popular', 'Популярные сериалы', 'landscape', '/tv/popular', {}, 'tv'),
        shelf('t-air', 'Выходят сейчас', 'poster', '/tv/on_the_air', {}, 'tv'),
        shelf('t-top', 'Лучшие за всё время', 'poster', '/tv/top_rated', {}, 'tv'),
        genreTiles('tv', TV_GENRES).then((items) => ({ id: 't-genres', title: 'Жанры', kind: 'genre' as const, items })),
        shelf('t-crime', 'Криминал', 'landscape', '/discover/tv', { with_genres: 80, sort_by: 'popularity.desc' }, 'tv'),
        shelf('t-scifi', 'Фантастика', 'poster', '/discover/tv', { with_genres: 10765, sort_by: 'popularity.desc' }, 'tv'),
        shelf('t-comedy', 'Комедии', 'poster', '/discover/tv', { with_genres: 35, sort_by: 'popularity.desc' }, 'tv'),
      ]),
    ]);
    return { hero, shelves };
  }

  if (tab === 'kids') {
    const [hero, shelves] = await Promise.all([
      heroFrom(['/discover/movie'], { type: 'movie', params: { with_genres: 16, ...KIDS_MOVIE } }),
      collect([
        shelf('k-popular', 'Популярные мультфильмы', 'landscape', '/discover/movie', { with_genres: 16, ...KIDS_MOVIE }, 'movie'),
        shelf('k-series', 'Мультсериалы', 'poster', '/discover/tv', { with_genres: 10762, sort_by: 'popularity.desc' }, 'tv'),
        shelf('k-family', 'Для всей семьи', 'poster', '/discover/movie', { with_genres: 10751, without_genres: '27,53,80', ...KIDS_MOVIE }, 'movie'),
        shelf('k-top', 'Лучшие мультфильмы', 'poster', '/discover/movie', { with_genres: 16, ...KIDS_MOVIE, sort_by: 'vote_average.desc', 'vote_count.gte': 2000 }, 'movie'),
        shelf('k-pixar', 'Pixar', 'landscape', '/discover/movie', { with_companies: 3, ...KIDS_MOVIE }, 'movie'),
        shelf('k-disney', 'Disney', 'poster', '/discover/movie', { with_companies: 2, with_genres: 16, ...KIDS_MOVIE }, 'movie'),
        shelf('k-dreamworks', 'DreamWorks', 'poster', '/discover/movie', { with_companies: 521, ...KIDS_MOVIE }, 'movie'),
        shelf('k-tv-family', 'Сериалы для всей семьи', 'landscape', '/discover/tv', { with_genres: '10751', without_genres: '80,18', sort_by: 'popularity.desc' }, 'tv'),
      ]),
    ]);
    return { hero, shelves };
  }

  const [hero, shelves] = await Promise.all([
    heroFrom(['/trending/all/week']),
    collect([
      shelf('h-trending', 'В тренде сегодня', 'landscape', '/trending/all/day'),
      shelf('h-movies', 'Популярные фильмы', 'poster', '/movie/popular', {}, 'movie'),
      shelf('h-shows', 'Популярные сериалы', 'landscape', '/tv/popular', {}, 'tv'),
      shelf('h-now', 'Сейчас в кино', 'poster', '/movie/now_playing', {}, 'movie'),
      shelf('h-top', 'Лучшие фильмы', 'poster', '/movie/top_rated', {}, 'movie'),
      genreTiles('movie', MOVIE_GENRES).then((items) => ({ id: 'h-genres', title: 'Жанры', kind: 'genre' as const, items })),
    ]),
  ]);
  return { hero, shelves };
}

/** Логотипы для Top Shelf подгружаем после показа страницы — чтобы не задерживать её. */
export async function withLogos(page: Page): Promise<Page> {
  if (!hasTmdb) return page;
  const logos = await Promise.all(page.hero.map((i) => logoFor(i).catch(() => undefined)));
  return { ...page, hero: page.hero.map((i, n) => (logos[n] ? { ...i, logo: logos[n] } : i)) };
}
