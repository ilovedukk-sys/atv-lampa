/**
 * Заставка в духе Apple TV: кадры фильмов и сериалов из подборок на весь экран, медленно проплывают
 * и плавно сменяют друг друга; внизу слева — название, справа вверху — часы. Любая кнопка или движение
 * Magic Remote — назад туда, где были (нажатие при этом никуда не уходит).
 *
 * Для слабого ТВ: два слоя-кадра на всё время заставки, меняем им картинку, когда слой скрыт.
 * Движение (медленное приближение/отдаление со сдвигом) — translateZ в перспективе, как увеличение карточек:
 * scale() браузер ТВ перерисовывал бы на каждом кадре, а слой в перспективе рисуется один раз и растягивается.
 * Кадр ровно в экран (1920×1080), как в core/predecode: тогда картинка распаковывается один раз —
 * заранее, пока виден прошлый кадр (с кадром больше экрана трейс показал по две распаковки на картинку
 * и паузы до 0,7 с). В минимальном режиме переходов нет — кадры просто меняются.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item, Page } from '../data/types';
import { loadPage } from '../data/catalog';
import { img, isForKids } from '../api/tmdb';
import { imageSizes } from '../core/quality';
import { predecode } from '../core/predecode';
import { markActive } from '../core/screensaver';

const SLIDE_MS = 14000; // сколько держится кадр
const FADE_MS = 2500; // смена кадров
const MAX_ITEMS = 40;
// Приближение: translateZ при perspective 1000px (.saver) — 30 px ≈ ×1,03, 90 px ≈ ×1,10.
// Сдвиг вбок не больше запаса по краям при самом малом приближении (~29 px), иначе видна чёрная кромка.
const Z_NEAR = 90;
const Z_FAR = 30;
const SHIFT_X = 18;
// Ужасы, ток-шоу, новости, реалити — не для заставки
const NOT_FOR_SAVER = [27, 10767, 10763, 10764];
// Сдвиг указателя Magic Remote меньше этого не будит (дрожание руки, событие при появлении указателя)
const WAKE_MOVE_PX = 30;

export function Screensaver({ onExit }: { onExit: () => void }) {
  const layers = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const [caption, setCaption] = useState<Item | null>(null);
  const [time, setTime] = useState(clockNow);

  // Выход: любая кнопка (раньше движка фокуса и плеера — в фазе перехвата) или заметное движение указателя
  useEffect(() => {
    const exit = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      markActive();
      onExit();
    };
    let start: { x: number; y: number } | null = null;
    const onMove = (e: MouseEvent) => {
      if (!start) start = { x: e.clientX, y: e.clientY };
      else if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > WAKE_MOVE_PX) exit(e);
    };
    window.addEventListener('keydown', exit, true);
    window.addEventListener('mousedown', exit, true);
    window.addEventListener('wheel', exit, true);
    window.addEventListener('mousemove', onMove, true);
    return () => {
      window.removeEventListener('keydown', exit, true);
      window.removeEventListener('mousedown', exit, true);
      window.removeEventListener('wheel', exit, true);
      window.removeEventListener('mousemove', onMove, true);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTime(clockNow()), 20000);
    return () => clearInterval(t);
  }, []);

  // Показ кадров
  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => alive && fn(), ms));

    collectItems().then((items) => {
      if (!alive || !items.length) return;
      const size = imageSizes().hero;
      const url = (i: number) => img(items[i % items.length].backdrop, size) || '';
      let n = 0;

      // Подготовить скрытый слой: картинка и начальное положение (без перехода)
      const prepare = (el: HTMLDivElement, i: number) => {
        const [from] = drift(i);
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = from;
        (el.firstChild as HTMLImageElement).src = url(i);
      };
      // Показать: проявляется и плывёт до следующей смены (с запасом на её проявление)
      const reveal = (el: HTMLDivElement, i: number) => {
        const [, to] = drift(i);
        void el.offsetWidth; // начальное положение — до перехода
        el.style.transition = `opacity ${FADE_MS}ms ease, transform ${SLIDE_MS + FADE_MS * 2}ms linear`;
        el.style.opacity = '1';
        el.style.transform = to;
        setCaption(items[i % items.length]);
      };

      const step = () => {
        const front = layers[n % 2].current;
        const back = layers[(n + 1) % 2].current;
        if (!front || !back) return;
        reveal(front, n);
        back.style.opacity = '0'; // прошлый кадр гаснет, продолжая плыть
        // Погас — готовим в нём следующий кадр и распаковываем его заранее
        later(() => {
          prepare(back, n + 1);
          predecode(url(n + 1));
        }, FADE_MS + 100);
        later(() => {
          n++;
          step();
        }, SLIDE_MS);
      };

      prepare(layers[0].current!, 0);
      // Первый кадр — когда загрузится (иначе проявится пустой слой)
      const first = (layers[0].current!.firstChild as HTMLImageElement);
      // Обработчики снимаем: этот же <img> потом получит другие кадры, и каждый запускал бы ещё один круг
      const go = () => {
        first.onload = first.onerror = null;
        if (alive) step();
      };
      if (first.complete) go();
      else {
        first.onload = go;
        first.onerror = go;
      }
    });

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div class="saver">
      <div ref={layers[0]} class="saver__slide">
        <img alt="" />
      </div>
      <div ref={layers[1]} class="saver__slide">
        <img alt="" />
      </div>
      <div class="saver__shade" />
      <div class="saver__time">{time}</div>
      {caption && (
        <div key={caption.id} class="saver__caption">
          <div class="saver__title">{caption.title}</div>
          <div class="saver__meta">{[caption.kind === 'show' ? 'Сериал' : 'Фильм', caption.year].filter(Boolean).join(' · ')}</div>
        </div>
      )}
    </div>
  );
}

/** Как движется кадр (откуда, куда): по очереди приближается и отдаляется, сдвигаясь то влево, то вправо. */
function drift(i: number): [string, string] {
  const side = i % 4 < 2 ? 1 : -1;
  const near = `translate3d(${-side * SHIFT_X}px, 0, ${Z_NEAR}px)`;
  const far = `translate3d(${side * SHIFT_X}px, 0, ${Z_FAR}px)`;
  return i % 2 ? [near, far] : [far, near];
}

/** Кадры из уже загруженных подборок (главная, фильмы, сериалы) — без детского, вперемешку. */
async function collectItems(): Promise<Item[]> {
  const pages = await Promise.all(
    (['home', 'movies', 'shows'] as const).map((t) => loadPage(t).catch((): Page => ({ hero: [], shelves: [] }))),
  );
  const seen: Record<string, true> = {};
  const all: Item[] = [];
  pages.forEach((p) =>
    p.hero.concat(...p.shelves.map((s) => s.items)).forEach((i) => {
      if (!i.backdrop || !i.kind || seen[i.id] || isForKids(i)) return;
      if ((i.genreIds || []).some((g) => NOT_FOR_SAVER.indexOf(g) !== -1)) return;
      seen[i.id] = true;
      all.push(i);
    }),
  );
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = all[i];
    all[i] = all[j];
    all[j] = x;
  }
  return all.slice(0, MAX_ITEMS);
}

function clockNow() {
  const d = new Date();
  return `${d.getHours()}:${('0' + d.getMinutes()).slice(-2)}`;
}
