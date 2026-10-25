/**
 * Экран фильма/сериала из TMDB: один запрос с актёрами, похожими, возрастным рейтингом
 * и логотипом; серии сезона — отдельным запросом, когда сезон выбран.
 */
import type { Item } from '../data/types';
import type { Details, Season } from '../data/details';
import { cached, colorsFor, parseId, pickLogo, request, toItem, yearOf } from './tmdb';

export async function loadDetails(item: Item): Promise<Details | null> {
  const parsed = parseId(item.id);
  if (!parsed) return null;
  const [type, id] = parsed;

  return cached(`details2:${item.id}`, 24, async () => {
    const append = type === 'movie' ? 'credits,similar,release_dates,images' : 'credits,similar,content_ratings,images';
    const r = await request<any>(`/${type}/${id}`, {
      append_to_response: append,
      include_image_language: 'ru,en,null',
    });

    const full = toItem(r, type) as Item;
    const genres: string[] = (r.genres || []).map((g: any) => cap(g.name)).slice(0, 2);

    const cast: Item[] = ((r.credits && r.credits.cast) || []).slice(0, 15).map((p: any) => ({
      id: `person:${p.id}`,
      title: p.name,
      meta: p.character || '',
      colors: colorsFor('p' + p.id),
      poster: p.profile_path || undefined,
    }));

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
      description: r.overview || 'Описание на русском пока отсутствует.',
      director,
      cast,
      seasons,
      similar: similar.slice(0, 15),
      logo: pickLogo((r.images && r.images.logos) || []) || undefined,
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
