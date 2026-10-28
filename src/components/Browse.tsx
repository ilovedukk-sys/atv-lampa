/**
 * Вкладки «Главная», «Фильмы», «Сериалы»: фон Top Shelf + страница с полками.
 * Данные — из TMDB (src/data/catalog.ts), пока грузятся — индикатор.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Item, Page, Shelf } from '../data/types';
import { loadPage, withLogos, type BrowseTab } from '../data/catalog';
import { focusFirstIn, getFocused } from '../core/focus';
import { HERO_INTERVAL, Hero, HeroBackdrop } from './Hero';
import { ShelfRow } from './ShelfRow';
import { Message, Spinner } from './Spinner';
import { continueItems, continueText, lastWatch, resumable, useHistoryVersion } from '../core/history';
import { isUltra } from '../core/lite';
import { calmHex, tintOf } from '../core/color';
import { hasTmdb, img } from '../api/tmdb';
import type { WatchOptions } from '../App';


const DEFAULT_TINT = '#1f2229';
const FIRST_SHELF_STICK = 430;

interface Props {
  tab: BrowseTab;
  visible: boolean; // главная не скрыта экраном фильма
  bench: boolean;
  onOpen: (item: Item) => void;
  onWatch: (item: Item, opts?: WatchOptions) => void;
  notify: (text: string) => void;
  autoFocus: boolean; // поставить фокус на Top Shelf, когда страница загрузится
}

export function BrowseView({ tab, visible, bench, onOpen, onWatch, notify, autoFocus }: Props) {
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    loadPage(tab)
      .then((p) => {
        if (!alive) return;
        setPage(p);
        // Логотипы-названия для Top Shelf — следом, не задерживая страницу
        withLogos(p).then((withLogo) => alive && setPage(withLogo), () => {});
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [tab]);

  // Первая загрузка — фокус на «Смотреть»
  useEffect(() => {
    if (page && autoFocus) focusFirstIn('[data-hero]');
  }, [!!page]);

  const heroCount = page ? page.hero.length : 0;

  // Замер плавности листает слайды по команде
  useEffect(() => {
    if (!heroCount) return;
    const next = () => setHeroIndex((i) => (i + 1) % heroCount);
    window.addEventListener('bench-next-slide', next);
    return () => window.removeEventListener('bench-next-slide', next);
  }, [heroCount]);

  // Карусель Top Shelf: через 8 с после смены слайда (совпадает с полоской прогресса),
  // если страница видна и прокручена наверх; иначе ждём, пока вернутся
  useEffect(() => {
    if (!heroCount || bench || isUltra()) return; // минимальный режим — слайды только по кнопке «›»
    let t = 0;
    const tick = () => {
      const home = document.querySelector('.home');
      if (!document.hidden && visibleRef.v && home && !home.classList.contains('is-scrolled')) {
        setHeroIndex((i) => (i + 1) % heroCount);
      } else {
        t = window.setTimeout(tick, 1000);
      }
    };
    t = window.setTimeout(tick, HERO_INTERVAL);
    return () => clearTimeout(t);
  }, [heroIndex, heroCount]);

  visibleRef.v = visible;

  // Цвет фона под полками — из кадра текущего слайда (в минимальном режиме — без расчёта)
  const heroItem = page && page.hero[heroIndex];
  const [tint, setTint] = useState(DEFAULT_TINT);
  useEffect(() => {
    if (!heroItem) return;
    const fallback = calmHex(heroItem.colors[0]);
    if (isUltra()) return setTint(fallback);
    let alive = true;
    tintOf(img(heroItem.backdrop, 'w300'), fallback).then((c) => alive && setTint(c));
    return () => {
      alive = false;
    };
  }, [heroItem && heroItem.id]);

  /*
   * Полки — один раз на загруженную страницу. Без этого каждое открытие фильма (и возврат) заново
   * сравнивает всю главную — ~90 карточек, десятки миллисекунд на ТВ в самый неподходящий момент.
   * Те же объекты разметки Preact пропускает, не заходя внутрь. onOpen при этом остаётся первым —
   * это нормально: он работает через setState и ссылки (App.tsx) и от перерисовки не зависит.
   */
  /*
   * «Продолжить просмотр» — первой полкой главной, как в Apple TV: начатое и следующие серии, свежие первыми.
   * Строится заново только при изменении истории (закрыли плеер), остальные полки при этом не трогаем.
   * В замере плавности её нет — чтобы цифры сравнивались с прежними.
   */
  const historyVersion = useHistoryVersion();
  const cont = useMemo(() => (tab === 'home' && hasTmdb && !bench ? continueShelf() : null), [historyVersion]);
  const hasCont = !!cont;
  // Первая полка под Top Shelf встаёт ниже — сверху остаётся полоска кадра с названием, как в tvOS 26
  const firstStick = page && page.hero.length ? FIRST_SHELF_STICK : undefined;

  const contRow = useMemo(
    () =>
      page &&
      cont && (
        <ShelfRow
          key={cont.id}
          shelf={cont}
          stick={firstStick}
          onSelect={(item) => {
            // Сразу в плеер с того же места (или следующая серия); если запись пропала — экран фильма
            const last = lastWatch(item.id);
            if (resumable(last)) onWatch(last.item, { resume: last });
            else onOpen(item);
          }}
        />
      ),
    [page, cont],
  );

  const shelves = useMemo(
    () =>
      page &&
      page.shelves.map((s, i) => (
        <ShelfRow key={s.id} shelf={s} onSelect={onOpen} stick={i === 0 && !hasCont ? firstStick : undefined} />
      )),
    [page, hasCont],
  );

  // Досмотрели — карточка ушла с полки вместе с фокусом: ставим его на первую полку
  useEffect(() => {
    const f = getFocused();
    if (visible && page && f && !document.body.contains(f)) focusFirstIn('.home .shelf');
  }, [historyVersion]);

  if (error) return <Message title="Нет связи с TMDB" text="Проверьте интернет и откройте вкладку ещё раз." />;
  if (!page) return <Spinner />;
  if (!page.hero.length && !page.shelves.length) {
    return <Message title="Здесь пока пусто" text="Для этой вкладки нужен ключ TMDB — укажите его в «Настройках»." />;
  }

  return (
    <>
      {/* Фон страницы: виден под полками, когда кадр Top Shelf уехал вверх */}
      <div class="browse__bg" style={{ background: page.hero.length ? tint : '#000' }} />
      <HeroBackdrop items={page.hero} index={heroIndex} tint={tint} />
      <div class="page" data-scroll-y>
        {page.hero.length > 0 ? (
          <Hero
            items={page.hero}
            index={heroIndex}
            onPlay={(item) => {
              // Начинали смотреть — продолжаем с того же места, иначе выбор раздачи
              const last = lastWatch(item.id);
              onWatch(item, resumable(last) ? { resume: last } : {});
            }}
            onInfo={onOpen}
            onNext={() => setHeroIndex((i) => (i + 1) % page.hero.length)}
            notify={notify}
          />
        ) : (
          <div class="page__top" />
        )}
        {contRow}
        {shelves}
        <div class="page__end" />
      </div>
    </>
  );
}

// Видна ли главная — читается из таймера карусели без пересоздания эффекта
const visibleRef = { v: true };

/** Полка «Продолжить просмотр»: карточки 16:9 с полоской просмотра и строкой «серия · сколько осталось». */
function continueShelf(): Shelf | null {
  const list = continueItems();
  if (!list.length) return null;
  return {
    id: 'continue',
    title: 'Продолжить просмотр',
    kind: 'landscape',
    items: list.map(
      (e): Item => ({
        ...e.item,
        progress: e.upNext ? undefined : Math.min(1, e.time / e.duration),
        episode: continueText(e),
      }),
    ),
  };
}
