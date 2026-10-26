/**
 * Экран фильма/сериала из TMDB: один запрос с актёрами, похожими, возрастным рейтингом
 * и логотипом; серии сезона — отдельным запросом, когда сезон выбран.
 */
import type { Item } from '../data/types';
import type { Details, DetailsInfo, Season, Trailer } from '../data/details';
import { cached, colorsFor, parseId, pickLogo, request, toItem, yearOf } from './tmdb';

export async function loadDetails(item: Item): Promise<Details | null> {
  const parsed = parseId(item.id);
  if (!parsed) return null;
  const [type, id] = parsed;

  // details5 — добавились IMDb id (для Кинопоиска), режиссёры в «Актёрах», страны по-русски
  return cached(`details5:${item.id}`, 24, async () => {
    const append =
      type === 'movie'
        ? 'credits,similar,release_dates,images,videos'
        : 'credits,similar,content_ratings,images,videos,external_ids';
    const r = await request<any>(`/${type}/${id}`, {
      append_to_response: append,
      include_image_language: 'ru,en,null',
      include_video_language: 'ru,en',
    });

    const full = toItem(r, type) as Item;
    const genres: string[] = (r.genres || []).map((g: any) => cap(g.name)).slice(0, 2);

    // Актёры, а в конце — режиссёры (у сериала — создатели), как в «Актёры и съёмочная группа» Apple TV
    const person = (p: any, role: string): Item => ({
      id: `person:${p.id}`,
      title: p.name,
      meta: role,
      colors: colorsFor('p' + p.id),
      poster: p.profile_path || undefined,
    });
    const makers: any[] =
      type === 'movie'
        ? ((r.credits && r.credits.crew) || []).filter((c: any) => c.job === 'Director').slice(0, 2)
        : (r.created_by || []).slice(0, 2);
    const cast: Item[] = ((r.credits && r.credits.cast) || [])
      .slice(0, 14)
      .map((p: any) => person(p, p.character || ''))
      .concat(makers.map((p) => person(p, type === 'movie' ? 'Режиссёр' : 'Создатель')));

    const similar: Item[] = [];
    ((r.similar && r.similar.results) || []).forEach((x: any) => {
      const s = toItem(x, type);
      if (s && s.poster) similar.push(s);
    });

    const seasons: Season[] = ((r.seasons as any[]) || [])
      .filter((x) => x.season_number > 0 && x.episode_count > 0)
      .map((x) => ({
        number: x.season_number,
        name: x.name || `Сезон ${x.season_number}`,
        episodeCount: x.episode_count,
      }));

    const director =
      type === 'movie'
        ? ((r.credits && r.credits.crew) || []).filter((c: any) => c.job === 'Director').map((c: any) => c.name)[0]
        : (r.created_by || []).map((c: any) => c.name)[0];

    const details: Details = {
      item: { ...item, ...full, colors: item.colors },
      kind: type === 'tv' ? 'show' : 'movie',
      year: yearOf(r.release_date || r.first_air_date),
      genres,
      runtime: type === 'movie' ? formatRuntime(r.runtime) : seasonsLabel(r.number_of_seasons),
      age: type === 'movie' ? movieAge(r.release_dates) : tvAge(r.content_ratings),
      rating: r.vote_average ? r.vote_average.toFixed(1).replace('.', ',') : undefined,
      badges: [],
      description: r.overview || '', // нет русского — экран напишет «Описание отсутствует» (или возьмёт с Кинопоиска)
      imdbId: r.imdb_id || (r.external_ids && r.external_ids.imdb_id) || undefined,
      director,
      cast,
      seasons,
      similar: similar.slice(0, 15),
      trailers: trailersOf(r.videos),
      logo: pickLogo((r.images && r.images.logos) || []) || undefined,
      info: infoOf(r, type),
      loaded: true,
    };
    return details;
  });
}

/** Серии сезона. */
export async function loadSeason(item: Item, season: number): Promise<Item[]> {
  const parsed = parseId(item.id);
  if (!parsed) return [];
  const id = parsed[1];
  return cached(`season:${id}:${season}`, 24, async () => {
    const r = await request<any>(`/tv/${id}/season/${season}`);
    return ((r.episodes as any[]) || []).map((e) => ({
      id: `tv:${id}:s${season}e${e.episode_number}`,
      title: `${e.episode_number}. ${e.name || 'Серия ' + e.episode_number}`,
      meta: e.runtime ? `${e.runtime} мин` : e.air_date ? formatDate(e.air_date) : '',
      description: e.overview || '',
      colors: colorsFor(`s${season}e${e.episode_number}`),
      backdrop: e.still_path || undefined,
    }));
  });
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatRuntime(min?: number) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  return h ? `${h} ч ${min % 60} мин` : `${min} мин`;
}

function seasonsLabel(n?: number) {
  if (!n) return '';
  const last = n % 10;
  const tens = n % 100;
  const word =
    last === 1 && tens !== 11 ? 'сезон' : last >= 2 && last <= 4 && (tens < 10 || tens >= 20) ? 'сезона' : 'сезонов';
  return `${n} ${word}`;
}

function formatDate(d: string) {
  const parts = d.split('-');
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

const US_MOVIE: Record<string, string> = { G: '0+', PG: '6+', 'PG-13': '12+', R: '18+', 'NC-17': '18+' };
const US_TV: Record<string, string> = {
  'TV-Y': '0+',
  'TV-G': '0+',
  'TV-Y7': '6+',
  'TV-PG': '12+',
  'TV-14': '16+',
  'TV-MA': '18+',
};

function plus(v: string) {
  return /\+$/.test(v) ? v : v + '+';
}

/** Возрастной рейтинг: российский, если есть, иначе переводим американский. */
function movieAge(rd: any): string | undefined {
  const results: any[] = (rd && rd.results) || [];
  const cert = (country: string) => {
    const c = results.filter((x) => x.iso_3166_1 === country)[0];
    const dates: any[] = c ? c.release_dates : [];
    const found = dates.filter((x) => x.certification)[0];
    return found ? (found.certification as string) : '';
  };
  const ru = cert('RU');
  if (ru) return plus(ru);
  return US_MOVIE[cert('US')];
}

function tvAge(cr: any): string | undefined {
  const results: any[] = (cr && cr.results) || [];
  const by = (country: string) => {
    const c = results.filter((x) => x.iso_3166_1 === country)[0];
    return c ? (c.rating as string) : '';
  };
  const ru = by('RU');
  if (ru) return plus(ru);
  return US_TV[by('US')];
}

// ---------- блок «Информация» ----------

function names(list: any[] | undefined, limit = 4): string[] {
  const out: string[] = [];
  (list || []).forEach((x) => {
    const n = x && (x.name as string);
    if (n && out.indexOf(n) === -1 && out.length < limit) out.push(n);
  });
  return out;
}

function crew(r: any, jobs: string[], limit = 4) {
  return names(((r.credits && r.credits.crew) || []).filter((c: any) => jobs.indexOf(c.job) !== -1), limit);
}

export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function longDate(d?: string) {
  if (!d) return undefined;
  const [y, m, day] = d.split('-').map(Number);
  return m && day ? `${day} ${MONTHS[m - 1]} ${y}` : String(y);
}

function money(v?: number) {
  if (!v || v < 1000) return undefined;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1).replace('.', ',').replace(',0', '')} млрд`;
  return `$${Math.round(v / 1e6)} млн`;
}

const TV_STATUS: Record<string, string> = {
  'Returning Series': 'Выходит',
  'In Production': 'В производстве',
  Planned: 'Анонсирован',
  Ended: 'Завершён',
  Canceled: 'Закрыт',
};

const LANGS: Record<string, string> = {
  en: 'Английский', ru: 'Русский', uk: 'Украинский', fr: 'Французский', de: 'Немецкий', es: 'Испанский',
  it: 'Итальянский', pt: 'Португальский', ja: 'Японский', ko: 'Корейский', zh: 'Китайский', cn: 'Китайский (кантонский)',
  hi: 'Хинди', ar: 'Арабский', tr: 'Турецкий', pl: 'Польский', nl: 'Нидерландский', sv: 'Шведский', da: 'Датский',
  no: 'Норвежский', fi: 'Финский', cs: 'Чешский', hu: 'Венгерский', el: 'Греческий', he: 'Иврит', th: 'Тайский',
  id: 'Индонезийский', vi: 'Вьетнамский', fa: 'Персидский', ro: 'Румынский', bg: 'Болгарский', sr: 'Сербский',
  hr: 'Хорватский', ka: 'Грузинский', kk: 'Казахский', be: 'Белорусский', la: 'Латынь', ml: 'Малаялам',
  ta: 'Тамильский', te: 'Телугу', is: 'Исландский', ga: 'Ирландский', xx: 'Без слов',
};

// TMDB отдаёт страны только по-английски
const COUNTRIES: Record<string, string> = {
  US: 'США', GB: 'Великобритания', RU: 'Россия', SU: 'СССР', UA: 'Украина', BY: 'Беларусь', KZ: 'Казахстан',
  FR: 'Франция', DE: 'Германия', IT: 'Италия', ES: 'Испания', PT: 'Португалия', CA: 'Канада', AU: 'Австралия',
  NZ: 'Новая Зеландия', IE: 'Ирландия', JP: 'Япония', KR: 'Южная Корея', CN: 'Китай', HK: 'Гонконг', TW: 'Тайвань',
  IN: 'Индия', MX: 'Мексика', BR: 'Бразилия', AR: 'Аргентина', BE: 'Бельгия', NL: 'Нидерланды', LU: 'Люксембург',
  CH: 'Швейцария', AT: 'Австрия', SE: 'Швеция', NO: 'Норвегия', DK: 'Дания', FI: 'Финляндия', IS: 'Исландия',
  PL: 'Польша', CZ: 'Чехия', HU: 'Венгрия', RO: 'Румыния', BG: 'Болгария', RS: 'Сербия', HR: 'Хорватия',
  GR: 'Греция', TR: 'Турция', IL: 'Израиль', AE: 'ОАЭ', ZA: 'ЮАР', TH: 'Таиланд', ID: 'Индонезия',
  MT: 'Мальта', CY: 'Кипр', GE: 'Грузия', AM: 'Армения', LT: 'Литва', LV: 'Латвия', EE: 'Эстония',
};

function language(code: string, fallback?: string) {
  return LANGS[code] || fallback || code;
}

function infoOf(r: any, type: 'movie' | 'tv'): DetailsInfo {
  const original = r.original_title || r.original_name;
  const title = r.title || r.name;
  const firstYear = yearOf(r.first_air_date);
  const lastYear = yearOf(r.last_air_date);
  return {
    tagline: r.tagline || undefined,
    score: r.vote_count >= 10 ? Math.round(r.vote_average * 10) : undefined,
    votes: r.vote_count || undefined,
    released:
      type === 'movie'
        ? longDate(r.release_date)
        : firstYear
          ? r.status === 'Returning Series' || !lastYear || lastYear === firstYear
            ? `${firstYear}${r.status === 'Returning Series' ? ' — н. в.' : ''}`
            : `${firstYear}–${lastYear}`
          : undefined,
    status: type === 'tv' ? TV_STATUS[r.status] : undefined,
    studios: type === 'tv' && r.networks && r.networks.length ? names(r.networks, 3) : names(r.production_companies, 3),
    countries: ((r.production_countries as any[]) || []).slice(0, 3).map((c) => COUNTRIES[c.iso_3166_1] || c.name),
    originalTitle: original && original !== title ? original : undefined,
    originalLanguage: r.original_language ? language(r.original_language) : undefined,
    languages: ((r.spoken_languages as any[]) || []).map((l) => language(l.iso_639_1, l.english_name)).slice(0, 8),
    budget: money(r.budget),
    revenue: money(r.revenue),
    episodes: r.number_of_episodes || undefined,
    directors: type === 'movie' ? crew(r, ['Director']) : names(r.created_by),
    writers: crew(r, ['Screenplay', 'Writer', 'Novel', 'Story', 'Author']),
    producers: crew(r, ['Producer', 'Executive Producer'], 3),
    music: crew(r, ['Original Music Composer', 'Music'], 2),
  };
}

// ---------- трейлеры ----------

const TRAILER_TYPES = ['Trailer', 'Teaser'];

/** Трейлеры и тизеры с YouTube: сначала русские, затем официальные, трейлеры раньше тизеров, новые раньше старых. */
function trailersOf(videos: any): Trailer[] {
  const list: any[] = ((videos && videos.results) || []).filter(
    (v: any) => v.site === 'YouTube' && v.key && TRAILER_TYPES.indexOf(v.type) !== -1,
  );
  const score = (v: any) =>
    (v.iso_639_1 === 'ru' ? 0 : 1000) + (v.official ? 0 : 100) + TRAILER_TYPES.indexOf(v.type) * 10;
  list.sort((a, b) => score(a) - score(b) || String(b.published_at || '').localeCompare(String(a.published_at || '')));
  return list.slice(0, 8).map((v) => ({ key: v.key, name: v.name || 'Трейлер', lang: v.iso_639_1, type: v.type }));
}
