/**
 * Раздачи для фильма или сериала — из трёх мест сразу:
 *   1. то, что уже лежит в TorrServer (смотрели раньше или добавили через его веб-страницу);
 *   2. парсер в формате Jackett (Jackett, Prowlarr, jacred — адрес задаётся в «Настройках»);
 *   3. встроенный поиск TorrServer (Rutor / Torznab — если включён в настройках сервера).
 * Всё сводится к одному виду (Release), повторы по хешу убираются, сортировка — по сидам.
 */
import { listTorrents, serverSearch, serverSearchEnabled, timed, type TsTorrent } from './torrserver';

export interface Release {
  key: string;
  title: string;
  link: string; // magnet, хеш или ссылка на .torrent — TorrServer понимает всё
  hash?: string;
  size: number; // байт, 0 — неизвестно
  seeds: number; // -1 — неизвестно
  peers: number;
  tracker: string;
  date?: number; // мс
  res: number; // 2160 / 1080 / 720 / 480 / 0
  badges: string[]; // «4K», «HDR», «HEVC»…
  inServer?: boolean; // уже есть в TorrServer
}

export interface ReleaseQuery {
  id: string; // 'movie:603'
  title: string;
  originalTitle?: string;
  year?: number;
  kind?: 'movie' | 'show';
}

// ---------- парсер (Jackett API) ----------

const PARSER_KEY = 'parser';

export interface ParserConfig {
  url: string;
  key: string;
}

function loadParser(): ParserConfig {
  const fallback = {
    url: ((import.meta.env.VITE_PARSER_URL as string) || '').trim(),
    key: ((import.meta.env.VITE_PARSER_KEY as string) || '').trim(),
  };
  try {
    const raw = localStorage.getItem(PARSER_KEY);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

let parser = loadParser();

export function getParser() {
  return parser;
}

export function setParser(next: Partial<ParserConfig>) {
  parser = { ...parser, ...next };
  if (next.url !== undefined) parser.url = normalizeParserUrl(next.url);
  try {
    localStorage.setItem(PARSER_KEY, JSON.stringify(parser));
  } catch (e) {
    /* до перезапуска */
  }
  return parser;
}

function normalizeParserUrl(input: string) {
  let s = input.trim().replace(/\/+$/, '');
  if (s && !/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s;
}

async function parserSearch(q: ReleaseQuery): Promise<Release[]> {
  if (!parser.url) return [];
  const params = [
    `apikey=${encodeURIComponent(parser.key)}`,
    `Query=${encodeURIComponent(q.title)}`,
    // Эти параметры понимает jacred (как в Lampa), обычный Jackett их просто не заметит
    `title=${encodeURIComponent(q.title)}`,
    `title_original=${encodeURIComponent(q.originalTitle || q.title)}`,
    q.year ? `year=${q.year}` : '',
    `is_serial=${q.kind === 'show' ? 2 : 1}`,
  ].filter(Boolean);
  const url = `${parser.url}/api/v2.0/indexers/all/results?${params.join('&')}`;
  const r = await timed(fetch(url), 30000, 'Парсер');
  if (!r.ok) throw new Error(`Парсер: ошибка ${r.status}`);
  const json = await r.json();
  const results: any[] = (json && (json.Results || json.results)) || [];
  return results.map((x) =>
    makeRelease({
      title: x.Title,
      link: x.MagnetUri || x.Link,
      hash: x.InfoHash,
      size: Number(x.Size) || 0,
      seeds: x.Seeders,
      peers: x.Peers,
      tracker: x.Tracker || x.TrackerId || 'Парсер',
      date: x.PublishDate,
    }),
  );
}

// ---------- встроенный поиск TorrServer ----------

async function torrServerSearch(q: ReleaseQuery): Promise<Release[]> {
  if (!(await serverSearchEnabled())) return [];
  const queries = [q.title];
  if (q.originalTitle && q.originalTitle !== q.title) queries.push(q.originalTitle);
  const lists = await Promise.all(queries.map((x) => serverSearch(x)));
  const out: Release[] = [];
  lists.forEach((list) =>
    list.forEach((x) =>
      out.push(
        makeRelease({
          title: x.title || x.Title || x.name,
          link: x.magnet || x.Magnet || x.link || x.Link,
          hash: x.hash || x.Hash,
          size: typeof x.size === 'number' ? x.size : parseSize(String(x.size || x.Size || '')),
          seeds: x.seed !== undefined ? x.seed : x.Seed,
          peers: x.peer !== undefined ? x.peer : x.Peer,
          tracker: x.tracker || x.Tracker || 'TorrServer',
          date: x.createDate || x.CreateDate,
        }),
      ),
    ),
  );
  return out;
}

// ---------- уже в TorrServer ----------

/** Наша метка в поле data раздачи — по ней узнаём «свои» раздачи. */
export function releaseData(q: ReleaseQuery) {
  return { atv: { id: q.id, title: q.title } };
}

async function inServer(q: ReleaseQuery): Promise<Release[]> {
  const list = await listTorrents();
  return list
    .filter((t) => ownedBy(t, q) || matchesTitle(t.title || t.name || '', q))
    .map((t) => ({
      ...makeRelease({
        title: t.name && t.name !== t.title ? `${t.title} · ${t.name}` : t.title,
        link: t.hash,
        hash: t.hash,
        size: t.torrent_size || 0,
        seeds: -1,
        peers: -1,
        tracker: 'TorrServer',
      }),
      inServer: true,
    }));
}

function ownedBy(t: TsTorrent, q: ReleaseQuery) {
  if (!t.data) return false;
  try {
    const d = JSON.parse(t.data);
    return !!d && !!d.atv && d.atv.id === q.id;
  } catch (e) {
    return false;
  }
}

// ---------- всё вместе ----------

export interface ReleaseResult {
  releases: Release[];
  errors: string[];
  searched: boolean; // был ли настроен хоть один поиск (иначе — только то, что уже в TorrServer)
}

export async function findReleases(q: ReleaseQuery): Promise<ReleaseResult> {
  const errors: string[] = [];
  const guard = (p: Promise<Release[]>) =>
    p.catch((e: Error) => {
      errors.push(e.message || String(e));
      return [] as Release[];
    });

  const searchOn = !!parser.url || (await serverSearchEnabled().catch(() => false));
  const [own, found, server] = await Promise.all([
    guard(inServer(q)),
    guard(parserSearch(q)),
    guard(torrServerSearch(q)),
  ]);

  const seen: Record<string, true> = {};
  const unique = (r: Release) => {
    const id = r.hash ? r.hash.toLowerCase() : r.link;
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  };
  const relevant = found.concat(server).filter((r) => matchesTitle(r.title, q) && yearFits(r.title, q));
  relevant.sort((a, b) => b.seeds - a.seeds);
  return {
    releases: own.filter(unique).concat(relevant.filter(unique)),
    errors,
    searched: searchOn,
  };
}

// ---------- разбор названия раздачи ----------

function makeRelease(x: {
  title: string;
  link: string;
  hash?: string;
  size: number;
  seeds?: number;
  peers?: number;
  tracker: string;
  date?: string | number;
}): Release {
  const title = String(x.title || '').trim();
  const hash = (x.hash || hashFromMagnet(x.link) || '').toLowerCase() || undefined;
  const { res, badges } = quality(title);
  const date = x.date ? new Date(x.date as any).getTime() : NaN;
  return {
    key: hash || x.link,
    title,
    link: x.link,
    hash,
    size: x.size || 0,
    seeds: typeof x.seeds === 'number' ? x.seeds : -1,
    peers: typeof x.peers === 'number' ? x.peers : -1,
    tracker: x.tracker,
    date: isNaN(date) ? undefined : date,
    res,
    badges,
  };
}

function hashFromMagnet(link: string) {
  const m = /btih:([a-f0-9]{40})/i.exec(link || '');
  return m ? m[1] : '';
}

/** Качество по названию: «… 2160p HDR10 HEVC …» → 4K, HDR, HEVC. */
export function quality(title: string): { res: number; badges: string[] } {
  const t = title.toLowerCase();
  let res = 0;
  if (/2160p|\b4k\b|\buhd\b/.test(t)) res = 2160;
  else if (/1080[pi]/.test(t)) res = 1080;
  else if (/720p/.test(t)) res = 720;
  else if (/480p|dvdrip|\bsd\b|\bxvid\b/.test(t)) res = 480;
  const badges: string[] = [];
  if (res) badges.push(res === 2160 ? '4K' : res === 480 ? 'SD' : `${res}p`);
  if (/dolby ?vision|\bdovi\b|\bdv\b/.test(t)) badges.push('DV');
  if (/hdr10\+|hdr10plus/.test(t)) badges.push('HDR10+');
  else if (/\bhdr/.test(t)) badges.push('HDR');
  if (/hevc|[hx]\.?265/.test(t)) badges.push('HEVC');
  if (/remux/.test(t)) badges.push('REMUX');
  return { res, badges };
}

const UNITS: Record<string, number> = { k: 1, m: 2, g: 3, t: 4, к: 1, м: 2, г: 3, т: 4 };

/** «1.46 GB» / «14,2 ГБ» → байты. */
export function parseSize(s: string): number {
  const m = /([\d.,]+)\s*([kmgtкмгт])/i.exec(s);
  if (!m) return 0;
  return parseFloat(m[1].replace(',', '.')) * Math.pow(1024, UNITS[m[2].toLowerCase()]);
}

export function formatSize(bytes: number): string {
  if (!bytes) return '';
  const gb = bytes / 1073741824;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1).replace('.', ',')} ГБ`;
  return `${Math.round(bytes / 1048576)} МБ`;
}

/** Только буквы и цифры, ё = е: «Матрица: Перезагрузка» → «матрицаперезагрузка». */
function squash(s: string) {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/g, '');
}

/** Парсеры отвечают «примерно похожим» — оставляем раздачи, где есть название фильма. */
function matchesTitle(releaseTitle: string, q: ReleaseQuery) {
  const t = squash(releaseTitle);
  const names = [q.title, q.originalTitle || ''].map(squash).filter((x) => x.length > 0);
  return names.some((n) => t.indexOf(n) !== -1);
}

/** У фильма год в названии раздачи должен совпадать (±1): иначе это ремейк или другая часть. */
function yearFits(releaseTitle: string, q: ReleaseQuery) {
  if (!q.year || q.kind === 'show') return true;
  const years = releaseTitle.match(/\b(19|20)\d\d\b/g);
  if (!years) return true;
  return years.some((y) => Math.abs(Number(y) - q.year!) <= 1);
}

// ---------- файлы раздачи ----------

const VIDEO = /\.(mkv|mp4|m4v|avi|mov|ts|m2ts|mts|wmv|webm|mpg|mpeg|vob|flv)$/i;

export function isVideo(path: string) {
  return VIDEO.test(path);
}

/** Сезон и серия из имени файла: «S01E02», «1x02», «02 серия», «E02». */
export function episodeOf(path: string): { season?: number; episode?: number } {
  const name = path.split('/').pop() || path;
  let m = /s(\d{1,2})[ ._-]?e(\d{1,3})/i.exec(name);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  m = /\b(\d{1,2})x(\d{2,3})\b/i.exec(name);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  const season = /(?:сезон|season|\bs)[ ._-]?(\d{1,2})/i.exec(path);
  m = /(?:\be|серия|series|episode|ep)[ ._-]?(\d{1,3})\b/i.exec(name) || /(\d{1,3})[ ._-]?(?:серия|series)/i.exec(name);
  if (m) return { season: season ? Number(season[1]) : undefined, episode: Number(m[1]) };
  m = /^(\d{1,3})\b/.exec(name);
  if (m) return { season: season ? Number(season[1]) : undefined, episode: Number(m[1]) };
  return {};
}

/** Видеофайлы раздачи по порядку (как в папке, с числами по значению: 2 < 10). */
export function videoFiles<T extends { path: string }>(files: T[]): T[] {
  return files
    .filter((f) => isVideo(f.path))
    .sort((a, b) => naturalCompare(a.path, b.path));
}

function naturalCompare(a: string, b: string) {
  const ax = a.toLowerCase().match(/(\d+|\D+)/g) || [];
  const bx = b.toLowerCase().match(/(\d+|\D+)/g) || [];
  for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    if (!isNaN(nx) && !isNaN(ny)) return nx - ny;
    return x < y ? -1 : 1;
  }
  return ax.length - bx.length;
}
