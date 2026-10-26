/**
 * Вкладки «Главная», «Фильмы», «Сериалы»: фон Top Shelf + страница с полками.
 * Данные — из TMDB (src/data/catalog.ts), пока грузятся — индикатор.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Item, Page } from '../data/types';
import { loadPage, withLogos, type BrowseTab } from '../data/catalog';
import { focusFirstIn } from '../core/focus';
import { HERO_INTERVAL, Hero, HeroBackdrop } from './Hero';
import { ShelfRow } from './ShelfRow';
import { Message, Spinner } from './Spinner';
import { finished, lastWatch } from '../core/history';
import { isUltra } from '../core/lite';
import { calmHex, tintOf } from '../core/color';
import { img } from '../api/tmdb';
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

  if (error) return <Message title="Нет связи с TMDB" text="Проверьте интернет и откройте вкладку ещё раз." />;
  if (!page) return <Spinner />;
  if (!page.hero.length && !page.shelves.length) {
    return <Message title="Здесь пока пусто" text="Для этой вкладки нужен ключ TMDB — см. файл .env.example." />;
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
              onWatch(item, last && last.time > 30 && !finished(last) ? { resume: last } : {});
            }}
            onInfo={onOpen}
            onNext={() => setHeroIndex((i) => (i + 1) % page.hero.length)}
            notify={notify}
          />
        ) : (
          <div class="page__top" />
        )}
        {page.shelves.map((s, i) => (
          // Первая полка под Top Shelf встаёт ниже — сверху остаётся полоска кадра с названием, как в tvOS 26
          <ShelfRow key={s.id} shelf={s} onSelect={onOpen} stick={i === 0 && page.hero.length ? FIRST_SHELF_STICK : undefined} />
        ))}
        <div class="page__end" />
      </div>
    </>
  );
}

// Видна ли главная — читается из таймера карусели без пересоздания эффекта
const visibleRef = { v: true };
