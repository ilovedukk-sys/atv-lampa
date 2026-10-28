import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item, PlayRequest } from './data/types';
import { heroItems, shelves } from './data/mock';
import { focus, focusFirstIn, getFocused, openSidebar, startFocusEngine } from './core/focus';
import { hasTmdb } from './api/tmdb';
import { Sidebar } from './components/Sidebar';
import { SettingsView } from './components/SettingsView';
import { BrowseView } from './components/Browse';
import { LibraryView } from './components/LibraryView';
import { SearchView } from './components/SearchView';
import { DetailsScreen } from './components/Details';
import { GenreScreen } from './components/GenreScreen';
import { PersonScreen } from './components/PersonScreen';
import { Sources, type Episode } from './components/Sources';
import { Player } from './components/Player';
import type { WatchEntry } from './core/history';
import { takeReturn } from './core/trailer';
import { benchRequested, launchParam, runBenchmark } from './core/bench';
import { toggleSounds } from './core/sound';
import { cycleEffects, isUltra } from './core/lite';
import { loadPage } from './data/catalog';
import { Screensaver } from './components/Screensaver';
import { watchIdle } from './core/screensaver';

const BENCH = benchRequested();
// Для опытов с профилировщиком: {"still":1} — Top Shelf не листается сам, иначе смена слайда путает замеры
const STILL = launchParam('still') !== null;

// Разогрев экрана фильма: через сколько после загрузки главной и сколько держать (нижние разделы — ~1,1 с)
const WARM_DELAY_MS = 2000;

const EFFECTS_TOAST = {
  full: 'Все эффекты включены',
  lite: 'Облегчённый режим: без тяжёлых эффектов',
  ultra: 'Минимальный режим: для самых слабых ТВ',
};
const WARM_HOLD_MS = 2000;

type Tab = 'search' | 'home' | 'movies' | 'shows' | 'kids' | 'library' | 'settings';

/** Экран поверх главной: фильм/сериал, подборка жанра, актёр, выбор раздачи или плеер. */
interface Entry {
  type: 'details' | 'genre' | 'person' | 'sources' | 'player';
  item: Item;
  episode?: Episode;
  resume?: WatchEntry;
  play?: PlayRequest;
}

/** Как смотреть: выбрать серию или продолжить с того же места. */
export interface WatchOptions {
  episode?: Episode;
  resume?: WatchEntry;
}

export function App() {
  // Первый запуск без ключа TMDB — сразу в «Настройки»: без ключа нет настоящих фильмов
  const [tab, setTab] = useState<Tab>(hasTmdb || BENCH ? 'home' : 'settings');
  const [toast, setToast] = useState<string | null>(null);

  /*
   * Стек экранов: главная (с вкладками) всегда внизу, сверху — открытые фильмы и жанры.
   * Скрытые экраны остаются в памяти, поэтому «Назад» возвращает ровно туда, где были.
   */
  const [stack, setStack] = useState<Entry[]>([]);
  const savedFocus = useRef<(HTMLElement | null)[]>([]);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const notify = (text: string) => setToast(text);

  const openItem = (item: Item) => {
    let type: Entry['type'] = 'details';
    if (item.id.indexOf('genre:') === 0) {
      type = 'genre';
    } else if (item.id.indexOf('person:') === 0) {
      type = 'person';
    } else if (!item.kind && item.meta === '') {
      notify(`Подборка «${item.title}» работает с ключом TMDB`);
      return;
    }
    savedFocus.current.push(getFocused());
    setStack((s) => s.concat({ type, item }));
  };

  // «Смотреть» → экран выбора раздачи (для «Продолжить» он сразу подключается к той же раздаче)
  const watch = (item: Item, opts: WatchOptions = {}) => {
    savedFocus.current.push(getFocused());
    setStack((s) => s.concat({ type: 'sources', item, episode: opts.episode, resume: opts.resume }));
  };

  /*
   * Плеер. replace — заменить экран раздач (фильм из одного файла): «Назад» из плеера
   * ведёт сразу к фильму. Иначе плеер поверх списка серий — «Назад» возвращает к сериям.
   */
  const play = (req: PlayRequest, replace: boolean) => {
    if (!replace) savedFocus.current.push(getFocused());
    setStack((s) => (replace ? s.slice(0, -1) : s).concat({ type: 'player', item: req.item, play: req }));
  };

  const closeTop = () => {
    restoreFocus.current = savedFocus.current.pop() || null;
    setStack((s) => s.slice(0, -1));
  };

  // После возврата — фокус на элемент, с которого открывали экран
  useEffect(() => {
    const el = restoreFocus.current;
    restoreFocus.current = null;
    if (el && document.body.contains(el)) focus(el);
  }, [stack.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // «Назад» на главной: сначала к началу страницы, потом открывает боковую панель,
  // из панели — выход из приложения (экраны фильмов и жанров обрабатывают «Назад» сами)
  useEffect(() => {
    startFocusEngine(() => {
      const home = document.querySelector('.home') as HTMLElement;
      const focused = getFocused();
      if (focused && focused.closest('[data-sidebar]')) window.close();
      else if (home.classList.contains('is-scrolled') && document.querySelector('[data-hero]')) focusFirstIn('[data-hero]');
      else openSidebar(home);
    });
    if (BENCH) waitForShelves().then(runBenchmark);

    // Жёлтая кнопка пульта (на компьютере — F3): звуки навигации вкл/выкл
    // Зелёная кнопка (на компьютере — F4): облегчённый режим без тяжёлых эффектов
    document.addEventListener('keydown', (e) => {
      if (e.keyCode === 405 || e.keyCode === 114) {
        notify(toggleSounds() ? 'Звуки навигации включены' : 'Звуки навигации выключены');
        e.preventDefault();
      } else if (e.keyCode === 404 || e.keyCode === 115) {
        notify(EFFECTS_TOAST[cycleEffects()]);
        e.preventDefault();
      }
    });

    // Вернулись после трейлера, а webOS успела закрыть приложение — открываем тот же фильм
    const back = takeReturn();
    if (back && !BENCH) openItem(back);

    // Отладка: сразу открыть экран — параметр {"open":"movie:603"} или ?open=movie:603 (актёр — person:6384)
    const openId = launchParam('open');
    if (openId) {
      const all = heroItems.concat(...shelves.map((s) => s.items));
      const known = all.filter((x) => x.id === openId)[0];
      const item: Item | undefined = known || (/^(movie|tv|person):\d+$/.test(openId) && hasTmdb
        ? { id: openId, title: '', meta: '', kind: openId.indexOf('tv:') === 0 ? 'show' : 'movie', colors: ['#333', '#000'] }
        : undefined);
      if (item) openItem(item);
    }
  }, []);

  /*
   * «Разогрев» экрана фильма: через пару секунд после загрузки главной скрыто (display: none) строим
   * экран фильма для первого слайда Top Shelf и через 2 с убираем. Код экрана выполняется заранее,
   * и первое настоящее открытие фильма на слабом ТВ идёт так же плавно, как следующие.
   */
  const [warm, setWarm] = useState<Item | null>(null);
  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    if (isUltra()) return; // в минимальном режиме бережём память — без разогрева
    loadPage('home')
      .then((page) => {
        const first = page.hero[0];
        if (!alive || !first) return;
        timers.push(window.setTimeout(() => setWarm(first), WARM_DELAY_MS));
        timers.push(window.setTimeout(() => setWarm(null), WARM_DELAY_MS + WARM_HOLD_MS));
      })
      .catch(() => {});
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  const homeVisible = stack.length === 0;
  const playing = stack.length > 0 && stack[stack.length - 1].type === 'player';

  /*
   * Заставка после нескольких минут без нажатий (core/screensaver.ts) — кроме плеера и замера.
   * Без ключа TMDB кадров нет — и заставки нет.
   */
  const [saver, setSaver] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;
  useEffect(() => {
    if (BENCH || !hasTmdb) return;
    const show = () => setSaver(true);
    // «Посмотреть заставку» в «Настройках» и {"saver":1} / ?saver=1 для проверки
    window.addEventListener('show-saver', show);
    if (launchParam('saver') !== null) show();
    const stop = watchIdle(() => !playingRef.current, show);
    return () => {
      stop();
      window.removeEventListener('show-saver', show);
    };
  }, []);

  return (
    <div class={`app${playing ? ' is-playing' : ''}${saver ? ' is-saver' : ''}`}>
      <div class={`screen home${homeVisible ? '' : ' is-hidden'}`} data-screen>
        {tab === 'home' || tab === 'movies' || tab === 'shows' || tab === 'kids' ? (
          <BrowseView
            key={tab}
            tab={tab}
            visible={homeVisible}
            bench={BENCH || STILL}
            onOpen={openItem}
            onWatch={watch}
            notify={notify}
            autoFocus={tab === 'home' && !getFocused()}
          />
        ) : tab === 'library' ? (
          <LibraryView onOpen={openItem} />
        ) : tab === 'settings' ? (
          <SettingsView notify={notify} />
        ) : (
          <SearchView active={homeVisible} onOpen={openItem} />
        )}

        <Sidebar active={tab} onSelect={(id) => setTab(id as Tab)} />
      </div>

      {stack.map((entry, i) =>
        entry.type === 'player' ? (
          <Player key={'player:' + i} req={entry.play!} active={i === stack.length - 1} onClose={closeTop} />
        ) : entry.type === 'sources' ? (
          <Sources
            key={'sources:' + entry.item.id + ':' + i}
            item={entry.item}
            episode={entry.episode}
            resume={entry.resume}
            active={i === stack.length - 1}
            onPlay={play}
            onClose={closeTop}
          />
        ) : entry.type === 'person' ? (
          <PersonScreen
            key={entry.item.id + ':' + i}
            person={entry.item}
            active={i === stack.length - 1}
            onOpen={openItem}
            onClose={closeTop}
          />
        ) : entry.type === 'genre' ? (
          <GenreScreen
            key={entry.item.id + ':' + i}
            genre={entry.item}
            active={i === stack.length - 1}
            onOpen={openItem}
            onClose={closeTop}
          />
        ) : (
          <DetailsScreen
            key={entry.item.id + ':' + i}
            item={entry.item}
            active={i === stack.length - 1}
            onOpen={openItem}
            onWatch={watch}
            onClose={closeTop}
            notify={notify}
          />
        ),
      )}

      {warm && (
        <DetailsScreen
          key="warm"
          item={warm}
          active={false}
          warm
          onOpen={() => {}}
          onWatch={() => {}}
          onClose={() => {}}
          notify={() => {}}
        />
      )}

      {saver && (
        <Screensaver
          onExit={() => setSaver(false)}
          onOpen={(item) => {
            setSaver(false);
            openItem(item);
          }}
        />
      )}

      <div class={`toast glass${toast ? ' is-visible' : ''}`}>{toast}</div>
    </div>
  );
}

/** Замер плавности начинаем, когда главная загрузилась (полки на месте). */
function waitForShelves(): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (document.querySelector('.shelf') || Date.now() - started > 15000) setTimeout(resolve, 2500);
      else setTimeout(check, 300);
    };
    check();
  });
}
