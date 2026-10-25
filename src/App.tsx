import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from './data/types';
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
import { benchRequested, launchParam, runBenchmark } from './core/bench';
import { toggleSounds } from './core/sound';
import { toggleLite } from './core/lite';

const BENCH = benchRequested();

type Tab = 'search' | 'home' | 'movies' | 'shows' | 'library' | 'settings';

/** Экран поверх главной: фильм/сериал или подборка жанра. */
interface Entry {
  type: 'details' | 'genre';
  item: Item;
}

export function App() {
  const [tab, setTab] = useState<Tab>('home');
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
    } else if (!item.kind && item.meta === '') {
      notify(`Подборка «${item.title}» работает с ключом TMDB`);
      return;
    }
    savedFocus.current.push(getFocused());
    setStack((s) => s.concat({ type, item }));
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
        notify(toggleLite() ? 'Облегчённый режим: эффекты выключены' : 'Все эффекты включены');
        e.preventDefault();
      }
    });

    // Отладка: сразу открыть экран — параметр {"open":"movie:603"} или ?open=movie:603
    const openId = launchParam('open');
    if (openId) {
      const all = heroItems.concat(...shelves.map((s) => s.items));
      const known = all.filter((x) => x.id === openId)[0];
      const item: Item | undefined = known || (/^(movie|tv):\d+$/.test(openId) && hasTmdb
        ? { id: openId, title: '', meta: '', kind: openId.indexOf('tv:') === 0 ? 'show' : 'movie', colors: ['#333', '#000'] }
        : undefined);
      if (item) openItem(item);
    }
  }, []);

  const homeVisible = stack.length === 0;

  return (
    <div class="app">
      <div class={`screen home${homeVisible ? '' : ' is-hidden'}`} data-screen>
        {tab === 'home' || tab === 'movies' || tab === 'shows' ? (
          <BrowseView
            key={tab}
            tab={tab}
            visible={homeVisible}
            bench={BENCH}
            onOpen={openItem}
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
        entry.type === 'genre' ? (
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
            onClose={closeTop}
            notify={notify}
          />
        ),
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
