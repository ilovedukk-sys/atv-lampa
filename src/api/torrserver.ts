/**
 * TorrServer (MatriX): сервер, который качает торрент по кусочкам и сразу отдаёт видео потоком.
 * Приложение только просит: «добавь раздачу», «какие в ней файлы», «дай ссылку на файл» —
 * а видео играет обычный плеер телевизора по http.
 *
 * Адрес сервера — в «Настройках» (по умолчанию VITE_TORRSERVER_URL из .env.local).
 * Запросы отправляем как text/plain: TorrServer всё равно читает JSON, а браузеру не нужен
 * лишний предварительный запрос (CORS preflight) — на слабом ТВ это заметная задержка.
 */

const STORAGE_KEY = 'torrserver';
const DEFAULT_URL = ((import.meta.env.VITE_TORRSERVER_URL as string) || '').trim();

export interface TsFile {
  id: number;
  path: string;
  length: number;
}

export interface TsTorrent {
  hash: string;
  title: string;
  name?: string;
  poster?: string;
  data?: string;
  stat: number; // 0 добавлен, 1 получает данные, 2 подготовка, 3 работает, 4 закрыт, 5 из базы
  stat_string?: string;
  torrent_size?: number;
  file_stats?: TsFile[];
  download_speed?: number; // байт/с
  active_peers?: number;
  total_peers?: number;
  connected_seeders?: number;
  preloaded_bytes?: number;
  preload_size?: number;
}

/** «192.168.0.15» → «http://192.168.0.15:8090»; пустая строка — сервер не задан. */
export function normalizeUrl(input: string): string {
  let s = input.trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  if (!/^https?:\/\/[^/]+:\d+/i.test(s)) s = s.replace(/^(https?:\/\/[^/]+)/i, '$1:8090');
  return s;
}

let server = normalizeUrl(DEFAULT_URL);
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) server = saved;
} catch (e) {
  /* по умолчанию */
}

export function tsUrl() {
  return server;
}

export function hasTorrServer() {
  return !!server;
}

export function setTsUrl(input: string) {
  server = normalizeUrl(input);
  settings = null;
  try {
    localStorage.setItem(STORAGE_KEY, server);
  } catch (e) {
    /* до перезапуска */
  }
  return server;
}

// ---------- запросы ----------

/** fetch с ограничением по времени (AbortController в Chrome 53 ещё нет). */
export function timed<T>(p: Promise<T>, ms: number, what = 'Сервер'): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} не отвечает`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function post<T>(path: string, body: object, ms = 15000, base = server): Promise<T> {
  if (!base) return Promise.reject(new Error('Адрес TorrServer не указан'));
  return timed(
    fetch(base + path, { method: 'POST', body: JSON.stringify(body) }).then((r) => {
      if (!r.ok) throw new Error(`TorrServer: ошибка ${r.status}`);
      return r.text();
    }),
    ms,
    'TorrServer',
  ).then((text) => (text ? JSON.parse(text) : null) as T);
}

function get<T>(path: string, ms = 20000): Promise<T> {
  if (!server) return Promise.reject(new Error('Адрес TorrServer не указан'));
  return timed(
    fetch(server + path).then((r) => {
      if (!r.ok) throw new Error(`TorrServer: ошибка ${r.status}`);
      return r.json();
    }),
    ms,
    'TorrServer',
  );
}

/** Проверка связи: версия сервера («MatriX.141»). */
export function echo(base = server): Promise<string> {
  if (!base) return Promise.reject(new Error('Адрес TorrServer не указан'));
  return timed(
    fetch(base + '/echo').then((r) => {
      if (!r.ok) throw new Error(`ошибка ${r.status}`);
      return r.text();
    }),
    5000,
    'TorrServer',
  );
}

/** Добавить раздачу (magnet, хеш или ссылка на .torrent). Сохраняем в списке сервера — для «Продолжить». */
export function addTorrent(link: string, title: string, poster?: string, data?: object) {
  return post<TsTorrent>('/torrents', {
    action: 'add',
    link,
    title,
    poster: poster || '',
    data: data ? JSON.stringify(data) : '',
    save_to_db: true,
  });
}

export function getTorrent(hash: string) {
  return post<TsTorrent>('/torrents', { action: 'get', hash }, 8000);
}

export function listTorrents() {
  return post<TsTorrent[]>('/torrents', { action: 'list' }, 8000).then((x) => x || []);
}

/** Отметить серию просмотренной (её видно и в веб-интерфейсе TorrServer). */
export function setViewed(hash: string, fileIndex: number) {
  return post('/viewed', { action: 'set', hash, file_index: fileIndex }, 5000).catch(() => null);
}

/** Ссылка на файл для плеера. Имя файла в пути — некоторым плеерам так проще понять формат. */
export function streamUrl(hash: string, file: TsFile) {
  const name = file.path.split('/').pop() || 'video';
  return `${server}/stream/${encodeURIComponent(name)}?link=${hash}&index=${file.id}&play`;
}

// ---------- встроенный поиск TorrServer ----------

interface TsSettings {
  EnableRutorSearch?: boolean;
  EnableTorznabSearch?: boolean;
}

let settings: Promise<TsSettings> | null = null;

function loadSettings() {
  if (!settings) {
    settings = post<TsSettings>('/settings', { action: 'get' }, 6000).then((s) => s || {});
    settings.catch(() => (settings = null));
  }
  return settings;
}

/** Есть ли на сервере свой поиск раздач (Rutor или Torznab — включаются в настройках TorrServer). */
export async function serverSearchEnabled() {
  const s = await loadSettings();
  return !!(s.EnableRutorSearch || s.EnableTorznabSearch);
}

/** Поиск средствами TorrServer. Ответ — как есть, его разбирает api/releases.ts. */
export async function serverSearch(query: string): Promise<any[]> {
  const s = await loadSettings();
  const q = encodeURIComponent(query);
  const jobs: Promise<any[]>[] = [];
  if (s.EnableRutorSearch) jobs.push(get<any[]>(`/search?query=${q}`).catch(() => []));
  if (s.EnableTorznabSearch) jobs.push(get<any[]>(`/torznab/search?query=${q}`).catch(() => []));
  const all = await Promise.all(jobs);
  return ([] as any[]).concat(...all.map((x) => x || []));
}
