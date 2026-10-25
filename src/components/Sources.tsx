/**
 * Выбор раздачи: слева постер и название, справа — раздачи (качество, размер, сиды).
 * После выбора раздача добавляется в TorrServer; если в ней одна серия/фильм — сразу плеер,
 * если много файлов — список серий. Для сериала с выбранной серией нужный файл ищется сам.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item, PlayRequest, TorrentFile } from '../data/types';
import {
  episodeOf,
  findReleases,
  formatSize,
  releaseData,
  videoFiles,
  type Release,
  type ReleaseResult,
} from '../api/releases';
import { addTorrent, getTorrent, hasTorrServer, type TsTorrent } from '../api/torrserver';
import { img } from '../api/tmdb';
import { focus, focusedClass, pushBackHandler } from '../core/focus';
import { finished, lastWatch, positionOf, type WatchEntry } from '../core/history';
import { imageSizes } from '../core/quality';
import { Badge } from './Buttons';
import { Spinner } from './Spinner';

export interface Episode {
  season: number;
  episode: number;
}

interface Props {
  item: Item;
  episode?: Episode; // сериал: какую серию хотели включить
  resume?: WatchEntry; // «Продолжить»: сразу та же раздача и тот же файл, без поиска
  active: boolean;
  onPlay: (req: PlayRequest, replace: boolean) => void;
  onClose: () => void;
}

type Phase =
  | { name: 'search' }
  | { name: 'list' }
  | { name: 'connect'; release: Release; status: string }
  | { name: 'files'; release: Release; torrent: TsTorrent; files: TorrentFile[] }
  | { name: 'error'; text: string };

const FILTERS: { id: string; label: string; test: (r: Release) => boolean }[] = [
  { id: 'all', label: 'Все', test: () => true },
  { id: '4k', label: '4K', test: (r) => r.res === 2160 },
  { id: '1080', label: '1080p', test: (r) => r.res === 1080 },
  { id: '720', label: '720p', test: (r) => r.res === 720 },
];

const CONNECT_TIMEOUT_MS = 60000;
// Выбранная строка списка держится на этой высоте — заголовок над первыми строками не уезжает
const LIST_TOP = 300;

export function Sources({ item, episode, resume, active, onPlay, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'search' });
  const [result, setResult] = useState<ReleaseResult | null>(null);
  const [filter, setFilter] = useState('all');
  const lastKey = useRef(''); // на какой раздаче был фокус — вернуться к ней
  const attempt = useRef(0); // отменить подключение, если ушли «Назад»

  // Поиск раздач (или сразу подключение — для «Продолжить»)
  useEffect(() => {
    if (!hasTorrServer()) {
      setPhase({ name: 'error', text: 'Укажите адрес TorrServer в «Настройках».' });
      return;
    }
    if (resume) {
      connect(
        { key: resume.hash, title: item.title, link: resume.link, hash: resume.hash, size: 0, seeds: -1, peers: -1, tracker: '', res: 0, badges: [] },
        resume.fileId,
      );
      return;
    }
    let alive = true;
    findReleases({
      id: item.id,
      title: item.title,
      originalTitle: item.originalTitle,
      year: item.year,
      kind: item.kind,
    }).then(
      (r) => {
        if (!alive) return;
        setResult(r);
        setPhase({ name: 'list' });
      },
      (e: Error) => alive && setPhase({ name: 'error', text: e.message }),
    );
    return () => {
      alive = false;
    };
  }, []);

  // Фокус: на раздачу, с которой ушли, иначе на первую; в списке серий — на недосмотренную
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (phase.name === 'list') {
      const back = lastKey.current && (el.querySelector(`[data-key="${lastKey.current}"]`) as HTMLElement | null);
      const first = el.querySelector('.release') as HTMLElement | null;
      const target = back || first || (el.querySelector('[data-focusable]') as HTMLElement | null);
      if (target) focus(target);
    } else if (phase.name === 'files') {
      const target = (el.querySelector('.release.is-current') || el.querySelector('.release')) as HTMLElement | null;
      if (target) focus(target);
    }
  }, [phase.name]);

  // «Назад»: из серий и подключения — к списку раздач, из списка — закрыть экран
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => {
      if ((phase.name === 'files' || phase.name === 'connect') && result) {
        attempt.current++;
        setPhase({ name: 'list' });
      } else onClose();
    });
  }, [active, phase, result]);

  const play = (release: Release, torrent: TsTorrent, files: TorrentFile[], file: TorrentFile, replace: boolean) => {
    onPlay(
      {
        item,
        hash: torrent.hash,
        link: release.link,
        files,
        index: files.indexOf(file),
        subs: (torrent.file_stats || []).filter((f) => /\.srt$/i.test(f.path)),
      },
      replace,
    );
  };

  const connect = async (release: Release, fileId?: number) => {
    lastKey.current = release.key;
    const n = ++attempt.current;
    const alive = () => n === attempt.current;
    setPhase({ name: 'connect', release, status: 'Подключаемся к раздаче…' });
    try {
      const added = await addTorrent(release.link, item.title, img(item.poster, imageSizes().poster), releaseData(item));
      let torrent = added;
      const started = Date.now();
      // Список файлов появляется, когда TorrServer получит описание раздачи от других участников
      while (!(torrent.file_stats && torrent.file_stats.length)) {
        if (!alive()) return;
        if (Date.now() - started > CONNECT_TIMEOUT_MS) throw new Error('Раздача не отвечает: нет сидов. Выберите другую.');
        await wait(1000);
        torrent = await getTorrent(added.hash);
        if (alive()) setPhase({ name: 'connect', release, status: peersText(torrent) });
      }
      if (!alive()) return;
      const files = videoFiles(torrent.file_stats);
      if (!files.length) throw new Error('В этой раздаче нет видеофайлов.');

      if (fileId !== undefined) {
        const same = files.filter((f) => f.id === fileId)[0];
        if (same) return play(release, torrent, files, same, true);
      }
      const wanted = episode ? findEpisode(files, episode) : undefined;
      if (wanted) return play(release, torrent, files, wanted, false);
      if (files.length === 1) return play(release, torrent, files, files[0], true);
      setPhase({ name: 'files', release, torrent, files });
    } catch (e) {
      if (alive()) setPhase({ name: 'error', text: (e as Error).message });
    }
  };

  const poster = img(item.poster, imageSizes().poster);
  const sub = [item.year, episode ? `Сезон ${episode.season}, серия ${episode.episode}` : ''].filter(Boolean).join(' · ');

  return (
    <div ref={root} class={`screen sources${active ? '' : ' is-hidden'}`} data-screen>
      <div class="sources__side">
        <div
          class="sources__poster"
          style={{ backgroundColor: item.colors[1], backgroundImage: poster ? `url(${poster})` : undefined }}
        />
        <div class="sources__title">{item.title}</div>
        {sub && <div class="sources__sub">{sub}</div>}
      </div>

      {phase.name === 'search' && <Spinner text="Ищем раздачи…" />}
      {phase.name === 'connect' && <Spinner text={phase.status} />}
      {phase.name === 'error' && <ErrorBox text={phase.text} onBack={() => (result ? setPhase({ name: 'list' }) : onClose())} />}
      {phase.name === 'list' && result && (
        <ReleaseList result={result} filter={filter} setFilter={setFilter} onPick={connect} />
      )}
      {phase.name === 'files' && (
        <FileList
          release={phase.release}
          torrent={phase.torrent}
          files={phase.files}
          item={item}
          onPick={(f) => play(phase.release, phase.torrent, phase.files, f, false)}
        />
      )}
    </div>
  );
}

function ReleaseList(props: {
  result: ReleaseResult;
  filter: string;
  setFilter: (id: string) => void;
  onPick: (r: Release) => void;
}) {
  const { result, filter } = props;
  const all = result.releases;
  const active = FILTERS.filter((f) => f.id === filter)[0] || FILTERS[0];
  const shown = all.filter(active.test);
  const chips = FILTERS.filter((f) => f.id === 'all' || all.some(f.test));

  if (!all.length) {
    return (
      <div class="sources__empty">
        <div class="message__title">Раздач не нашлось</div>
        <div class="message__text">
          {result.errors.length
            ? result.errors.join('. ')
            : result.searched
              ? 'Попробуйте позже или другой поиск в настройках.'
              : 'Поиск раздач не настроен. Включите поиск в настройках TorrServer (Rutor или Torznab) или укажите парсер в «Настройках» приложения. Раздачи, добавленные в TorrServer вручную, тоже появятся здесь.'}
        </div>
      </div>
    );
  }

  return (
    <div class="page sources__list" data-scroll-y data-section-offset={LIST_TOP}>
      <section class="sources__head" data-section data-section-top>
        <h2>Выберите раздачу</h2>
        <div class="sources__chips" data-focus-group>
          {chips.map((f) => (
            <Chip key={f.id} label={f.label} active={f.id === filter} onPick={() => props.setFilter(f.id)} />
          ))}
          <span class="sources__count">{shown.length}</span>
        </div>
      </section>
      {shown.map((r) => (
        <ReleaseRow key={r.key} r={r} onPick={() => props.onPick(r)} />
      ))}
      {result.errors.length > 0 && <div class="sources__note">{result.errors.join('. ')}</div>}
      <div class="page__end" />
    </div>
  );
}

function Chip({ label, active, onPick }: { label: string; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      class={`chip${active ? ' is-active' : ''}${focusedClass(ref.current)}`}
      data-focusable
      onClick={onPick}
    >
      {label}
    </button>
  );
}

function ReleaseRow({ r, onPick }: { r: Release; onPick: () => void }) {
  return (
    <div class="release" data-section data-focusable data-key={r.key} onClick={onPick}>
      <div class="release__main">
        <div class="release__title">{r.title}</div>
        <div class="release__meta">
          {r.badges.map((b) => (
            <Badge key={b}>{b}</Badge>
          ))}
          <span>{[r.tracker, r.date ? formatDate(r.date) : ''].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div class="release__side">
        <div class="release__size">{formatSize(r.size)}</div>
        {r.inServer ? (
          <div class="release__seeds is-saved">В TorrServer</div>
        ) : (
          r.seeds >= 0 && (
            <div class={`release__seeds${r.seeds < 3 ? ' is-low' : ''}`}>
              ↑ {r.seeds} · ↓ {r.peers >= 0 ? r.peers : '?'}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function FileList(props: {
  release: Release;
  torrent: TsTorrent;
  files: TorrentFile[];
  item: Item;
  onPick: (f: TorrentFile) => void;
}) {
  const { torrent, files } = props;
  const last = lastWatch(props.item.id);
  return (
    <div class="page sources__list" data-scroll-y data-section-offset={LIST_TOP}>
      <section class="sources__head" data-section data-section-top>
        <h2>{files.length} {plural(files.length, 'файл', 'файла', 'файлов')}</h2>
        <div class="sources__release">{props.release.title}</div>
      </section>
      {files.map((f) => {
        const ep = episodeOf(f.path);
        const name = f.path.split('/').pop() || f.path;
        const pos = positionOf(torrent.hash, f.id);
        const current = !!last && last.hash === torrent.hash && last.fileId === f.id;
        const done = current && finished(last!);
        return (
          <div
            key={f.id}
            class={`release release--file${current ? ' is-current' : ''}`}
            data-section
            data-focusable
            onClick={() => props.onPick(f)}
          >
            <div class="release__main">
              <div class="release__title">
                {ep.episode !== undefined ? `${ep.season ? `Сезон ${ep.season}, ` : ''}серия ${ep.episode}` : name}
              </div>
              <div class="release__meta">
                <span>{ep.episode !== undefined ? name : ''}</span>
              </div>
            </div>
            <div class="release__side">
              <div class="release__size">{formatSize(f.length)}</div>
              {(pos > 0 || done) && <div class="release__seeds is-saved">{done ? 'Просмотрено' : 'Начато'}</div>}
            </div>
          </div>
        );
      })}
      <div class="page__end" />
    </div>
  );
}

function ErrorBox({ text, onBack }: { text: string; onBack: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ref.current) focus(ref.current);
  }, [text]);
  return (
    <div class="sources__empty">
      <div class="message__title">Не получилось</div>
      <div class="message__text">{text}</div>
      <button ref={ref} class="btn btn--text sources__back" data-focusable onClick={onBack}>
        Назад
      </button>
    </div>
  );
}

/** Нужная серия: совпадает номер серии и (если указан в имени) сезон. */
function findEpisode(files: TorrentFile[], want: Episode): TorrentFile | undefined {
  const parsed = files.map((f) => ({ f, ep: episodeOf(f.path) }));
  const exact = parsed.filter((x) => x.ep.season === want.season && x.ep.episode === want.episode)[0];
  if (exact) return exact.f;
  const loose = parsed.filter((x) => x.ep.season === undefined && x.ep.episode === want.episode)[0];
  return loose && loose.f;
}

function peersText(t: TsTorrent) {
  const peers = t.active_peers || 0;
  return peers ? `Получаем список файлов… участников: ${peers}` : 'Ищем участников раздачи…';
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function formatDate(ms: number) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
