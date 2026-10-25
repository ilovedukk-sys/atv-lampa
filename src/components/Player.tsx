/**
 * Плеер в стиле tvOS. Видео играет сам телевизор (аппаратный декодер webOS) по ссылке TorrServer,
 * интерфейс поверх — лёгкий: полоса времени снизу появляется при нажатиях и прячется сама.
 *
 *   «ОК», Play/Pause      — пауза / продолжить
 *   ← →                   — перемотка на 10 с (держать — быстрее), ⏪ ⏩ — на 30 с
 *   ↓                     — панель «Субтитры / Аудио», ↑ — показать время
 *   «Назад», Stop         — выйти (позиция запоминается, в следующий раз — с того же места)
 *
 * Пока идёт видео, интерфейс почти не перерисовывается: время обновляем, только когда оно на экране.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PlayRequest, TorrentFile } from '../data/types';
import { getTorrent, setViewed, streamUrl } from '../api/torrserver';
import { episodeOf } from '../api/releases';
import { focus, focusedClass, pushBackHandler } from '../core/focus';
import { clock, finished, historyChanged, positionOf, remember } from '../core/history';
import { sound } from '../core/sound';
import { Spinner } from './Spinner';

interface Props {
  req: PlayRequest;
  active: boolean;
  onClose: () => void;
}

const HIDE_MS = 4000;
const SEEK_APPLY_MS = 700; // перематываем, когда кнопку отпустили, — а не на каждый шаг
const SAVE_EVERY_MS = 10000;

const KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  PLAY: 415,
  PAUSE: 19,
  PLAY_PAUSE: 179,
  STOP: 413,
  FF: 417,
  RW: 412,
};

interface Cue {
  start: number;
  end: number;
  text: string;
}

export function Player({ req, active, onClose }: Props) {
  const [index, setIndex] = useState(req.index);
  const file = req.files[index];
  const video = useRef<HTMLVideoElement>(null);

  const [paused, setPaused] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [stats, setStats] = useState('');
  const [error, setError] = useState('');
  const [overlay, setOverlay] = useState(true);
  const [panel, setPanel] = useState(false);
  const [, tick] = useState(0); // перерисовать время на полосе
  const [note, setNote] = useState('');

  const pending = useRef<number | null>(null); // куда перематываем (пока держат кнопку)
  const seekTimer = useRef(0);
  const hideTimer = useRef(0);
  const repeat = useRef({ count: 0, at: 0 });

  // Субтитры .srt из раздачи
  const [subId, setSubId] = useState(-1);
  const cues = useRef<Cue[]>([]);
  const [cueText, setCueText] = useState('');
  const subs = subsFor(file, req.subs);

  const ep = episodeOf(file.path);
  const label =
    req.item.kind === 'show' && ep.episode !== undefined
      ? `${ep.season ? `Сезон ${ep.season}, ` : ''}серия ${ep.episode}`
      : req.files.length > 1
        ? file.path.split('/').pop() || ''
        : '';

  // ---------- показ интерфейса ----------

  const show = (keep = false) => {
    setOverlay(true);
    clearTimeout(hideTimer.current);
    if (!keep) hideTimer.current = window.setTimeout(() => setOverlay(false), HIDE_MS);
  };

  // На паузе полоса не прячется
  useEffect(() => {
    if (paused) show(true);
    else show();
  }, [paused]);

  // ---------- сохранение позиции ----------

  const save = (notify = false) => {
    const v = video.current;
    if (!v || !v.duration || isNaN(v.duration)) return;
    remember(
      {
        itemId: req.item.id,
        item: req.item,
        hash: req.hash,
        link: req.link,
        fileId: file.id,
        filePath: file.path,
        label,
        time: v.currentTime,
        duration: v.duration,
      },
      notify,
    );
  };

  // ---------- видео ----------

  useEffect(() => {
    const v = video.current!;
    setWaiting(true);
    setError('');
    setPaused(false);
    setSubId(-1);
    let resumed = false;

    const onMeta = () => {
      const pos = positionOf(req.hash, file.id);
      if (!resumed && pos > 30 && !finished({ time: pos, duration: v.duration })) {
        v.currentTime = pos;
        setNote(`Продолжаем с ${clock(pos)}`);
        setTimeout(() => setNote(''), 3500);
      }
      resumed = true;
      show();
    };
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => {
      setWaiting(false);
      setPaused(false);
    };
    const onPause = () => {
      setPaused(true);
      save();
    };
    const onTime = () => {
      if (cues.current.length) {
        const t = v.currentTime;
        const c = cues.current.filter((x) => t >= x.start && t <= x.end)[0];
        setCueText(c ? c.text : '');
      }
    };
    const onEnded = () => {
      save(true);
      setViewed(req.hash, file.id);
      if (index < req.files.length - 1) setIndex(index + 1);
      else onClose();
    };
    const onError = () => {
      setWaiting(false);
      const code = v.error ? v.error.code : 0;
      setError(
        code === 4
          ? 'Телевизор не умеет воспроизводить этот файл (формат видео или звука). Попробуйте другую раздачу.'
          : 'Видео не загрузилось. Проверьте TorrServer и попробуйте ещё раз.',
      );
    };

    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', onEnded);
    v.addEventListener('error', onError);
    v.src = streamUrl(req.hash, file);
    const p = v.play() as Promise<void> | undefined;
    if (p && p.catch) p.catch(() => {});

    const saver = setInterval(() => !v.paused && save(), SAVE_EVERY_MS);
    return () => {
      clearInterval(saver);
      save(true);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('error', onError);
      // Освобождаем аппаратный декодер телевизора — иначе следующее видео может не запуститься
      v.pause();
      v.removeAttribute('src');
      v.load();
    };
  }, [index]);

  // Закрыли плеер — экраны под ним обновят «Продолжить»
  useEffect(() => () => historyChanged(), []);

  // Пока буферизуется — показываем, как идёт загрузка в TorrServer
  useEffect(() => {
    if (!waiting) {
      setStats('');
      return;
    }
    let alive = true;
    const poll = () =>
      getTorrent(req.hash)
        .then((t) => {
          if (!alive) return;
          const speed = t.download_speed ? speedText(t.download_speed) : '';
          const peers = t.active_peers ? `участников: ${t.active_peers}` : 'ищем участников…';
          setStats([speed, peers].filter(Boolean).join(' · '));
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [waiting]);

  // Время на полосе — несколько раз в секунду, только пока полоса видна
  useEffect(() => {
    if (!overlay && !panel) return;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [overlay, panel]);

  // Свернули приложение кнопкой Home — пауза
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && video.current) video.current.pause();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Субтитры: скачиваем .srt через TorrServer и разбираем
  useEffect(() => {
    cues.current = [];
    setCueText('');
    const s = subs.filter((x) => x.id === subId)[0];
    if (!s) return;
    let alive = true;
    fetch(streamUrl(req.hash, s))
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (alive) cues.current = parseSrt(decodeText(buf));
      })
      .catch(() => alive && setNote('Не удалось загрузить субтитры'));
    return () => {
      alive = false;
    };
  }, [subId, index]);

  // ---------- управление ----------

  const togglePlay = () => {
    const v = video.current!;
    if (pending.current !== null) applySeek();
    if (v.paused) {
      const p = v.play() as Promise<void> | undefined;
      if (p && p.catch) p.catch(() => {});
    } else v.pause();
  };

  const applySeek = () => {
    clearTimeout(seekTimer.current);
    const v = video.current!;
    if (pending.current !== null) {
      v.currentTime = pending.current;
      pending.current = null;
      tick((x) => x + 1);
    }
  };

  const seekBy = (sec: number) => {
    const v = video.current!;
    if (!v.duration || isNaN(v.duration)) return;
    const from = pending.current !== null ? pending.current : v.currentTime;
    pending.current = Math.max(0, Math.min(v.duration - 3, from + sec));
    show();
    tick((x) => x + 1);
    clearTimeout(seekTimer.current);
    seekTimer.current = window.setTimeout(applySeek, SEEK_APPLY_MS);
  };

  // Кнопки пульта перехватываем раньше движка фокуса (кроме открытой панели — там обычная навигация)
  useEffect(() => {
    if (!active || panel) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.keyCode;
      let handled = true;
      if (k === KEY.LEFT || k === KEY.RIGHT) {
        // Держат кнопку — шаг растёт: 10 с → 30 с → 60 с
        const now = Date.now();
        const r = repeat.current;
        r.count = now - r.at < 300 ? r.count + 1 : 0;
        r.at = now;
        const step = r.count < 6 ? 10 : r.count < 16 ? 30 : 60;
        seekBy(k === KEY.LEFT ? -step : step);
        if (r.count === 0) sound.move();
      } else if (k === KEY.FF || k === KEY.RW) {
        seekBy(k === KEY.RW ? -30 : 30);
      } else if (k === KEY.ENTER || k === KEY.PLAY_PAUSE) {
        if (error) onClose();
        else togglePlay();
        sound.select();
      } else if (k === KEY.PLAY) {
        if (video.current!.paused) togglePlay();
      } else if (k === KEY.PAUSE) {
        if (!video.current!.paused) togglePlay();
      } else if (k === KEY.DOWN) {
        setPanel(true);
        sound.move();
      } else if (k === KEY.UP) {
        show();
      } else if (k === KEY.STOP) {
        onClose();
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, panel, index, error]);

  // «Назад»: закрывает панель, затем плеер
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => (panel ? setPanel(false) : onClose()));
  }, [active, panel]);

  // ---------- отрисовка ----------

  const v = video.current;
  const duration = v && v.duration && !isNaN(v.duration) ? v.duration : 0;
  const current = pending.current !== null ? pending.current : v ? v.currentTime : 0;
  const share = duration ? current / duration : 0;
  const buffered = v && duration ? bufferedEnd(v, current) / duration : 0;

  return (
    <div class={`screen player${active ? '' : ' is-hidden'}`} data-screen>
      <video ref={video} class="player__video" preload="auto" />

      {cueText && <div class={`player__subs${overlay ? ' is-raised' : ''}`}>{cueText}</div>}

      {waiting && !error && (
        <div class="player__center">
          <Spinner text={stats || 'Загрузка…'} />
        </div>
      )}

      {error && (
        <div class="player__center player__error">
          <div class="message__title">Не удаётся воспроизвести</div>
          <div class="message__text">{error}</div>
          <div class="player__hint">«ОК» или «Назад» — выйти</div>
        </div>
      )}

      <div class={`player__bar${overlay || paused || pending.current !== null ? ' is-visible' : ''}`}>
        <div class="player__title">{req.item.title}</div>
        {label && <div class="player__sub">{label}</div>}
        <div class="player__track">
          <i class="player__buffered" style={{ transform: `scaleX(${Math.min(1, buffered)})` }} />
          <i class="player__played" style={{ transform: `scaleX(${share})` }} />
          {pending.current !== null && (
            <span class="player__scrub" style={{ left: `${share * 100}%` }}>
              {clock(current)}
            </span>
          )}
        </div>
        <div class="player__times">
          <span>{clock(current)}</span>
          {note ? <span class="player__note">{note}</span> : paused ? <span class="player__note">Пауза</span> : null}
          <span>{duration ? '−' + clock(duration - current) : '--:--'}</span>
        </div>
      </div>

      {panel && (
        <Panel
          subs={subs}
          subId={subId}
          onSub={(id) => setSubId(id)}
          video={v}
          onClose={() => setPanel(false)}
        />
      )}
    </div>
  );
}

/** Панель сверху, как «Субтитры / Аудио» в tvOS. */
function Panel(props: {
  subs: TorrentFile[];
  subId: number;
  onSub: (id: number) => void;
  video: HTMLVideoElement | null;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [, redraw] = useState(0);
  const audio = audioTracksOf(props.video);

  useEffect(() => {
    const el = root.current!.querySelector('.chip.is-active') || root.current!.querySelector('[data-focusable]');
    if (el) focus(el as HTMLElement);
  }, []);

  return (
    <div ref={root} class="player__panel glass" data-screen>
      <div class="player__row" data-focus-group>
        <span class="player__rowlabel">Субтитры</span>
        <PanelChip label="Выкл." active={props.subId === -1} onPick={() => props.onSub(-1)} />
        {props.subs.map((s) => (
          <PanelChip key={s.id} label={subLabel(s.path)} active={props.subId === s.id} onPick={() => props.onSub(s.id)} />
        ))}
        {!props.subs.length && <span class="player__empty">в раздаче нет файлов субтитров</span>}
      </div>
      {audio.length > 1 && (
        <div class="player__row" data-focus-group>
          <span class="player__rowlabel">Аудио</span>
          {audio.map((t, i) => (
            <PanelChip
              key={i}
              label={t.label || langName(t.language) || `Дорожка ${i + 1}`}
              active={t.enabled}
              onPick={() => {
                for (let j = 0; j < audio.length; j++) audio[j].enabled = j === i;
                redraw((x) => x + 1);
              }}
            />
          ))}
        </div>
      )}
      <div class="player__hint">«Назад» — закрыть</div>
    </div>
  );
}

function PanelChip({ label, active, onPick }: { label: string; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button ref={ref} class={`chip${active ? ' is-active' : ''}${focusedClass(ref.current)}`} data-focusable onClick={onPick}>
      {label}
    </button>
  );
}

// ---------- помощники ----------

/** Дорожки звука (если телевизор их показывает — зависит от версии webOS и файла). */
function audioTracksOf(v: HTMLVideoElement | null): any[] {
  const list = v && (v as any).audioTracks;
  if (!list || !list.length) return [];
  const out: any[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i]);
  return out;
}

/** Субтитры к этому видео: с тем же именем (Film.ru.srt к Film.mkv) или все, если серий нет. */
function subsFor(file: TorrentFile, subs: TorrentFile[]) {
  const base = (file.path.split('/').pop() || '').replace(/\.[^.]+$/, '').toLowerCase();
  const own = subs.filter((s) => (s.path.split('/').pop() || '').toLowerCase().indexOf(base) === 0);
  const list = own.length ? own : subs.length <= 20 ? subs : [];
  // Русские — первыми
  const ru = (s: TorrentFile) => (subLabel(s.path) === 'Русские' ? 0 : 1);
  return list.slice().sort((a, b) => ru(a) - ru(b));
}

const LANGS: Record<string, string> = {
  ru: 'Русские', rus: 'Русские', en: 'Английские', eng: 'Английские', uk: 'Украинские', ukr: 'Украинские',
  de: 'Немецкие', ger: 'Немецкие', fr: 'Французские', fre: 'Французские', es: 'Испанские', spa: 'Испанские',
  it: 'Итальянские', ita: 'Итальянские', pl: 'Польские', pt: 'Португальские', nl: 'Нидерландские',
  ja: 'Японские', jpn: 'Японские', ko: 'Корейские', zh: 'Китайские',
};

function langName(code?: string) {
  return code ? LANGS[code.toLowerCase()] : undefined;
}

/** «Sintel.ru.srt» → «Русские», «Forced.srt» → «Forced». */
function subLabel(path: string) {
  const name = (path.split('/').pop() || path).replace(/\.srt$/i, '');
  const parts = name.split(/[._ \-\[\]()]+/).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const l = langName(parts[i]);
    if (l) return l;
  }
  return name.length > 24 ? name.slice(0, 22) + '…' : name;
}

/** Скорость загрузки: «850 КБ/с», «2,4 МБ/с». */
function speedText(bytesPerSec: number) {
  const mb = bytesPerSec / 1048576;
  return mb >= 1 ? `${mb.toFixed(1).replace('.', ',')} МБ/с` : `${Math.round(bytesPerSec / 1024)} КБ/с`;
}

function bufferedEnd(v: HTMLVideoElement, at: number) {
  const b = v.buffered;
  for (let i = 0; i < b.length; i++) if (b.start(i) <= at + 1 && b.end(i) >= at) return b.end(i);
  return at;
}

/** Текст субтитров: UTF-8, а если не получилось — Windows-1251 (частый случай у русских .srt). */
function decodeText(buf: ArrayBuffer) {
  const TD = (window as any).TextDecoder;
  if (TD) {
    try {
      return new TD('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      return new TD('windows-1251').decode(buf);
    }
  }
  return String.fromCharCode.apply(null, Array.prototype.slice.call(new Uint8Array(buf)));
}

function parseSrt(text: string): Cue[] {
  const out: Cue[] = [];
  const time = (s: string) => {
    const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0;
  };
  text
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .forEach((block) => {
      const lines = block.split('\n').filter((l) => l.trim() !== '');
      const i = lines.findIndex((l) => l.indexOf('-->') !== -1);
      if (i === -1) return;
      const [a, b] = lines[i].split('-->');
      out.push({
        start: time(a),
        end: time(b),
        text: lines
          .slice(i + 1)
          .join('\n')
          .replace(/<[^>]+>/g, '')
          .replace(/\{[^}]+\}/g, ''),
      });
    });
  return out;
}
