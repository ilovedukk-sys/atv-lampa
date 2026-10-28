/**
 * Кинопоиск — по желанию (ключ в «Настройках»). Главный источник остаётся TMDB, Кинопоиск только дополняет:
 * оценки КП и IMDb, мнение критиков, «Знаете ли вы, что…», сборы в России; а если в TMDB нет
 * русского описания, слогана или возраста — берём их отсюда.
 *
 * API — kinopoiskapiunofficial.tech: бесплатный ключ после регистрации, 500 запросов в сутки.
 * Фильм находим по IMDb id из TMDB (точно), без него — по названию и году.
 * На один фильм уходит 4 запроса, ответ хранится неделю — лимита хватает с большим запасом.
 */
import type { Details } from '../data/details';
import { cached, forgetOld } from './tmdb';

const API = 'https://kinopoiskapiunofficial.tech/api';
const STORAGE = 'kpKey';
const ENV_KEY = ((import.meta.env.VITE_KP_KEY as string) || '').trim();

export function kpKey(): string {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved !== null) return saved;
  } catch (e) {
    /* без настроек */
  }
  return ENV_KEY;
}

/** Пустой ключ — Кинопоиск выключен. */
export function setKpKey(key: string) {
  try {
    localStorage.setItem(STORAGE, key.trim());
  } catch (e) {
    /* без запоминания */
  }
}

export const kpEnabled = () => kpKey().length > 0;

/**
 * Ошибка, о которой стоит сказать пользователю (ключ, лимит), — в отличие от сбоя сети.
 * Метка в поле, а не свой класс ошибки: instanceof у наследников Error ненадёжен в старой сборке.
 */
type KpProblem = 'key' | 'limit';
function kpError(message: string, problem: KpProblem) {
  const e = new Error(message) as Error & { kp?: KpProblem };
  e.kp = problem;
  return e;
}
export const kpProblem = (e: unknown): KpProblem | undefined => (e ? (e as { kp?: KpProblem }).kp : undefined);

const memory: Record<string, Promise<any>> = {};

function get<T>(path: string): Promise<T | null> {
  const url = API + path;
  if (!memory[url]) {
    // Заголовок с ключом = предварительный запрос OPTIONS; сервер Кинопоиска его разрешает
    memory[url] = fetch(url, { headers: { 'X-API-KEY': kpKey() } }).then((r) => {
      if (r.status === 404) return null;
      if (r.status === 401 || r.status === 403) throw kpError('Ключ Кинопоиска не подходит — проверьте в «Настройках»', 'key');
      if (r.status === 402) throw kpError('Запросы к Кинопоиску на сегодня закончились', 'limit');
      if (!r.ok) throw new Error(`Кинопоиск ${r.status}`);
      return r.json();
    });
    memory[url].catch(() => delete memory[url]);
    forgetOld(memory);
  }
  return memory[url];
}

/** Ключ работает? Сколько запросов на сегодня осталось. */
export function checkKpKey(): Promise<{ used: number; limit: number }> {
  return get<any>(`/v1/api_keys/${encodeURIComponent(kpKey())}`).then((r) => {
    delete memory[`${API}/v1/api_keys/${encodeURIComponent(kpKey())}`]; // остаток меняется — не запоминаем
    if (!r || !r.dailyQuota) throw kpError('Ключ Кинопоиска не найден', 'key');
    return { used: r.dailyQuota.used, limit: r.dailyQuota.value };
  });
}

export interface KpRating {
  value: number;
  votes?: number;
}

export interface Kp {
  id: number;
  url: string;
  kp?: KpRating;
  imdb?: KpRating;
  critics?: KpRating; // кинокритики в мире
  rfCritics?: KpRating; // кинокритики в России
  goodReviews?: number; // % положительных рецензий зрителей
  age?: string; // «16+»
  slogan?: string;
  description?: string;
  countries: string[]; // по-русски
  facts: string[]; // «Знаете ли вы, что…» — без спойлеров
  money: Record<string, string>; // BUDGET, RUS, USA, WORLD → «$63 млн»
}

export interface KpQuery {
  id: string; // наш id ('movie:603') — для кеша
  imdbId?: string;
  title: string;
  originalTitle?: string;
  year?: number;
  show: boolean;
}

export function kpQuery(d: Details): KpQuery {
  return {
    id: d.item.id,
    imdbId: d.imdbId,
    title: d.item.title,
    originalTitle: d.item.originalTitle,
    year: d.year,
    show: d.kind === 'show',
  };
}

export function loadKp(q: KpQuery): Promise<Kp | null> {
  return cached(`kp1:${q.id}`, 24 * 7, async () => {
    const id = await findId(q);
    if (!id) return null; // нет на Кинопоиске — тоже запоминаем, чтобы не тратить запросы
    const [f, facts, box] = await Promise.all([
      get<any>(`/v2.2/films/${id}`),
      get<any>(`/v2.2/films/${id}/facts`).catch(() => null),
      get<any>(`/v2.2/films/${id}/box_office`).catch(() => null),
    ]);
    if (!f) return null;
    const money: Record<string, string> = {};
    ((box && box.items) || []).forEach((b: any) => {
      const v = formatMoney(b.amount, b.symbol || b.currencyCode);
      if (v) money[b.type] = v;
    });
    const kp: Kp = {
      id,
      url: f.webUrl || `https://www.kinopoisk.ru/film/${id}/`,
      kp: rating(f.ratingKinopoisk, f.ratingKinopoiskVoteCount),
      imdb: rating(f.ratingImdb, f.ratingImdbVoteCount),
      critics: rating(f.ratingFilmCritics, f.ratingFilmCriticsVoteCount),
      rfCritics: rating(f.ratingRfCritics, f.ratingRfCriticsVoteCount),
      goodReviews: f.ratingGoodReview || undefined,
      age: /^age(\d+)$/.test(f.ratingAgeLimits || '') ? f.ratingAgeLimits.slice(3) + '+' : undefined,
      slogan: f.slogan && f.slogan !== '-' ? clean(f.slogan) : undefined,
      description: f.description ? clean(f.description) : f.shortDescription ? clean(f.shortDescription) : undefined,
      countries: ((f.countries as any[]) || []).map((c) => c.country).filter(Boolean).slice(0, 3),
      facts: ((facts && facts.items) || [])
        .filter((x: any) => x.type === 'FACT' && !x.spoiler)
        .map((x: any) => clean(x.text))
        .filter((t: string) => t.length > 0)
        .slice(0, 10),
      money,
    };
    return kp;
  });
}

async function findId(q: KpQuery): Promise<number | null> {
  if (q.imdbId) {
    const r = await get<any>(`/v2.2/films?imdbId=${encodeURIComponent(q.imdbId)}`);
    const hit = r && r.items && r.items[0];
    if (hit) return hit.kinopoiskId;
  }
  // Без IMDb id — по названию; берём только точное совпадение названия и типа, ближайшее по году
  const params = [`keyword=${encodeURIComponent(q.title)}`];
  if (q.year) params.push(`yearFrom=${q.year - 1}`, `yearTo=${q.year + 1}`);
  const r = await get<any>(`/v2.2/films?${params.join('&')}`);
  const same = (a?: string, b?: string) => !!a && !!b && norm(a) === norm(b);
  const found = ((r && r.items) || [])
    .filter((x: any) => (x.type !== 'FILM' && x.type !== 'VIDEO') === q.show)
    .filter((x: any) => same(x.nameRu, q.title) || same(x.nameOriginal, q.originalTitle) || same(x.nameEn, q.originalTitle))
    .sort((a: any, b: any) => Math.abs((a.year || 0) - (q.year || 0)) - Math.abs((b.year || 0) - (q.year || 0)));
  return found.length ? found[0].kinopoiskId : null;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');

function rating(value?: number | null, votes?: number | null): KpRating | undefined {
  return value ? { value, votes: votes || undefined } : undefined;
}

// В фактах Кинопоиска — ссылки и HTML-сущности: оставляем чистый текст (без innerHTML — так безопаснее)
const ENTITIES: Record<string, string> = {
  nbsp: ' ', laquo: '«', raquo: '»', quot: '"', amp: '&', mdash: '—', ndash: '–', hellip: '…', apos: "'", lt: '<', gt: '>',
};
function clean(html: string) {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) =>
      e.charAt(0) === '#' ? String.fromCharCode(Number(e.slice(1))) : ENTITIES[e.toLowerCase()] || m,
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function formatMoney(amount: number, symbol: string): string | undefined {
  if (!amount) return undefined;
  const n =
    amount >= 1e9
      ? `${trim(amount / 1e9)} млрд`
      : amount >= 1e6
        ? `${amount >= 1e7 ? Math.round(amount / 1e6) : trim(amount / 1e6)} млн`
        : formatNumber(amount);
  return symbol === '$' || symbol === '€' || symbol === '£' ? symbol + n : `${n} ${symbol}`;
}

const trim = (v: number) => v.toFixed(1).replace('.', ',').replace(',0', '');

/** 12345 → «12 345». */
export function formatNumber(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 8.512 → «8,5». */
export function score(v: number) {
  return v.toFixed(1).replace('.', ',');
}

/**
 * Экран фильма с данными Кинопоиска: TMDB главный, Кинопоиск заполняет пробелы
 * (описание, слоган, возраст) и даёт страны по-русски.
 */
export function withKp(d: Details, kp: Kp | null): Details {
  if (!kp) return d;
  const info = d.info && {
    ...d.info,
    tagline: d.info.tagline || kp.slogan,
    countries: kp.countries.length ? kp.countries : d.info.countries,
  };
  return { ...d, description: d.description || kp.description || '', age: d.age || kp.age, info };
}

/** Строки окна «Оценки»: все оценки Кинопоиска с числом голосов. */
export function kpRows(kp: Kp): [string, string][] {
  const out: [string, string][] = [];
  const add = (label: string, r?: KpRating) => r && out.push([label, r.votes ? `${score(r.value)} · ${votesLabel(r.votes)}` : score(r.value)]);
  add('Кинопоиск', kp.kp);
  add('IMDb', kp.imdb);
  add('Кинокритики в мире', kp.critics);
  // Больше 10 — значит, оценка в процентах положительных отзывов
  if (kp.rfCritics) out.push(['Кинокритики в России', kp.rfCritics.value > 10 ? `${Math.round(kp.rfCritics.value)}%` : score(kp.rfCritics.value)]);
  if (kp.goodReviews) out.push(['Положительных рецензий', `${Math.round(kp.goodReviews)}%`]);
  out.push(['Страница', kp.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')]);
  return out;
}

function votesLabel(n: number) {
  const last = n % 10;
  const tens = n % 100;
  const word = tens >= 11 && tens <= 14 ? 'оценок' : last === 1 ? 'оценка' : last >= 2 && last <= 4 ? 'оценки' : 'оценок';
  return `${formatNumber(n)} ${word}`;
}
