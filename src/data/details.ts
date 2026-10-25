/**
 * Подробности для экрана фильма/сериала.
 * С ключом TMDB данные приходят из src/api/details.ts, без ключа — генерируются здесь
 * из временных данных (одинаково при каждом запуске).
 */
import { shelves, type Item } from './mock';

export interface Season {
  number: number;
  name: string;
  episodeCount: number;
  episodes?: Item[]; // у TMDB серии грузятся отдельно, когда выбран сезон
}

export interface Details {
  item: Item;
  kind: 'movie' | 'show';
  year?: number;
  genres: string[];
  runtime: string; // «2 ч 46 мин» или «2 сезона»
  age?: string; // «16+»
  rating?: string; // «8,4»
  badges: string[]; // «4K», «HDR», «5.1»
  description: string;
  director?: string;
  cast: Item[];
  seasons: Season[];
  similar: Item[];
  logo?: string;
  loaded: boolean; // false — пока показываем то, что знаем из карточки
}

/** То, что можно показать сразу, ещё до ответа TMDB. */
export function quickDetails(item: Item): Details {
  const genre = item.meta.split(' · ')[0];
  return {
    item,
    kind: item.kind || 'movie',
    year: item.year,
    genres: genre && !/^\d+$/.test(genre) ? [genre] : [],
    runtime: '',
    rating: item.rating ? item.rating.toFixed(1).replace('.', ',') : undefined,
    badges: [],
    description: item.description || '',
    cast: [],
    seasons: [],
    similar: [],
    logo: item.logo,
    loaded: false,
  };
}

const GENRES = ['Фантастика', 'Драма', 'Триллер', 'Комедия', 'Приключения', 'Детектив', 'Криминал'];
const PEOPLE = [
  ['Анна Соколова', 'Ирина'],
  ['Максим Орлов', 'Виктор'],
  ['Елена Белова', 'Доктор Хейл'],
  ['Дмитрий Ковалёв', 'Капитан'],
  ['Ольга Морозова', 'Сара'],
  ['Сергей Волков', 'Марк'],
  ['Мария Лебедева', 'Агент Грей'],
  ['Павел Новиков', 'Тео'],
];
const EPISODE_TITLES = [
  'Новое начало',
  'Тени прошлого',
  'Точка невозврата',
  'Разлом',
  'Ложный след',
  'Буря',
  'Тишина',
  'Финал сезона',
];
const BADGES = [['4K', 'HDR', '5.1'], ['4K', 'Dolby Vision'], ['HD', '5.1'], ['4K', 'HDR10+', 'Atmos']];

/** Простое число из строки — чтобы «случайные» данные были одинаковыми при каждом запуске. */
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function getDetails(item: Item): Details {
  const h = hash(item.id + item.title);
  const kind: 'movie' | 'show' = item.kind || 'movie';
  const yearMatch = /(19|20)\d\d/.exec(item.meta);
  const year = yearMatch ? Number(yearMatch[0]) : 2015 + (h % 10);
  const g1 = GENRES[h % GENRES.length];
  const g2 = GENRES[(h >> 3) % GENRES.length];
  const genres = g1 === g2 ? [g1] : [g1, g2];

  const seasonsMatch = /(\d+) сезон/.exec(item.meta);
  const seasonsCount = kind === 'show' ? (seasonsMatch ? Number(seasonsMatch[1]) : 1 + (h % 3)) : 0;
  const seasons: Season[] = [];
  for (let s = 1; s <= seasonsCount; s++) {
    const episodes: Item[] = [];
    for (let e = 1; e <= 8; e++) {
      const k = 0.55 + ((s * 8 + e) % 7) * 0.08;
      episodes.push({
        id: `${item.id}-s${s}e${e}`,
        title: `${e}. ${EPISODE_TITLES[(e - 1 + s) % EPISODE_TITLES.length]}`,
        meta: `${42 + ((h + e * 7) % 18)} мин`,
        description: `Сезон ${s}, серия ${e}. Описание серии появится, когда подключим TMDB.`,
        colors: [shade(item.colors[0], k + 0.3), shade(item.colors[1], k)],
      });
    }
    seasons.push({ number: s, name: `Сезон ${s}`, episodeCount: episodes.length, episodes });
  }

  const cast: Item[] = PEOPLE.slice(0, 6 + (h % 3)).map((_, i) => {
    const [name, role] = PEOPLE[(i + h) % PEOPLE.length];
    return {
      id: `${item.id}-p${i}`,
      title: name,
      meta: role,
      colors: [shade(item.colors[0], 0.9 - i * 0.06), shade(item.colors[1], 1)],
    };
  });

  const similar = shelves[1].items.filter((x) => x.id !== item.id && x.title !== item.title).slice(0, 8);

  return {
    item,
    kind,
    year,
    genres,
    runtime:
      kind === 'show'
        ? `${seasonsCount} ${seasonsCount === 1 ? 'сезон' : 'сезона'}`
        : `${1 + (h % 2)} ч ${10 + (h % 50)} мин`,
    age: ['12+', '16+', '18+'][h % 3],
    rating: `${7 + (h % 20) / 10}`.replace('.', ','),
    badges: BADGES[h % BADGES.length],
    description:
      item.description ||
      'Здесь будет описание из TMDB — его подключим на этапе 4. ' +
        'Длинный текст обрезается до трёх строк, а целиком открывается в отдельном окне: ' +
        'выберите описание пультом и нажмите «ОК».',
    director: PEOPLE[(h >> 2) % PEOPLE.length][0],
    cast,
    seasons,
    similar,
    loaded: true,
  };
}
