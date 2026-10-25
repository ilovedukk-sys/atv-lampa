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


interface Props {
  tab: BrowseTab;
  visible: boolean; // главная не скрыта экраном фильма
  bench: boolean;
  onOpen: (item: Item) => void;
  notify: (text: string) => void;
  autoFocus: boolean; // поставить фокус на Top Shelf, когда страница загрузится
}

export function BrowseView({ tab, visible, bench, onOpen, notify, autoFocus }: Props) {
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
    if (!heroCount || bench) return;
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

  if (error) return <Message title="Нет связи с TMDB" text="Проверьте интернет и откройте вкладку ещё раз." />;
  if (!page) return <Spinner />;
  if (!page.hero.length && !page.shelves.length) {
    return <Message title="Здесь пока пусто" text="Для этой вкладки нужен ключ TMDB — см. файл .env.example." />;
  }

  return (
    <>
      <HeroBackdrop items={page.hero} index={heroIndex} />
      <div class="page" data-scroll-y>
        {page.hero.length > 0 ? (
          <Hero
            items={page.hero}
            index={heroIndex}
            onPlay={(item) => notify(`Плеер для «${item.title}» появится на этапе 5`)}
            onInfo={onOpen}
            onNext={() => setHeroIndex((i) => (i + 1) % page.hero.length)}
            notify={notify}
          />
        ) : (
          <div class="page__top" />
        )}
        {page.shelves.map((s) => (
          <ShelfRow key={s.id} shelf={s} onSelect={onOpen} />
        ))}
        <div class="page__end" />
      </div>
    </>
  );
}

// Видна ли главная — читается из таймера карусели без пересоздания эффекта
const visibleRef = { v: true };
