/**
 * Ленивая загрузка обложек: картинка грузится, когда карточка подъезжает к экрану,
 * плюс заранее — по ходу движения пульта, чтобы обложки были готовы до того, как их увидят.
 * На слабом ТВ грузить всё сразу нельзя: 100+ постеров съели бы и сеть, и память.
 *
 * <div data-src="..."> → картинка становится фоном (у <img data-src> подставляется src).
 */
import { onFocusChange } from './focus';

let observer: IntersectionObserver | null = null;

// Запас вокруг экрана: по вертикали ~2 полки, по горизонтали ~5 карточек
const MARGIN = '1100px 2000px 1100px 2000px';

// Подгрузка по ходу движения: в своём ряду — 6 карточек вперёд и 2 назад,
// в следующих 2 рядах (и в 1 ряду выше) — первые 6 карточек
const AHEAD = 6;
const BEHIND = 2;
const NEXT_ROWS = 2;
const PER_ROW = 6;

function load(el: HTMLElement) {
  const src = el.getAttribute('data-src');
  if (!src || el.getAttribute('data-loaded') === src) return; // уже загружена именно эта картинка
  el.setAttribute('data-loaded', src);
  if (el.tagName === 'IMG') el.setAttribute('src', src);
  else {
    // фон-обложка: на элемент меньше, чем с <img>; data-shade — затемнение поверх картинки
    const shade = el.getAttribute('data-shade');
    el.style.backgroundImage = shade ? `${shade}, url(${src})` : `url(${src})`;
  }
  if (observer) observer.unobserve(el);
}

function getObserver() {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          // В Chrome 53 (webOS 4) ещё нет isIntersecting — смотрим на долю пересечения
          const visible = e.isIntersecting !== undefined ? e.isIntersecting : e.intersectionRatio > 0;
          if (visible) load(e.target as HTMLElement);
        });
      },
      { rootMargin: MARGIN },
    );
  }
  return observer;
}

/** Подключить картинку. Возвращает функцию отключения. */
export function lazyImage(el: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    load(el);
    return () => {};
  }
  const io = getObserver();
  io.observe(el);
  return () => io.unobserve(el);
}

// ---------- подгрузка по ходу движения ----------

function loadCard(card: Element | undefined) {
  const bg = card && (card.querySelector('[data-src]') as HTMLElement | null);
  if (bg) load(bg);
}

function loadRow(row: Element, from: number, to: number) {
  const cards = row.querySelectorAll('.card');
  for (let i = Math.max(0, from); i <= to && i < cards.length; i++) loadCard(cards[i]);
}

function preloadAround(el: HTMLElement) {
  const row = el.closest('[data-section]');
  const page = el.closest('[data-scroll-y]');
  if (!row || !page) return;

  // Свой ряд: вперёд и чуть назад от выбранной карточки
  const cards = row.querySelectorAll('.card');
  let idx = -1;
  for (let i = 0; i < cards.length; i++) if (cards[i] === el) idx = i;
  if (idx !== -1) loadRow(row, idx - BEHIND, idx + AHEAD);

  // Соседние ряды страницы
  const rows = page.querySelectorAll('[data-section]');
  let r = 0;
  for (let i = 0; i < rows.length; i++) if (rows[i] === row) r = i;
  for (let j = r - 1; j <= r + NEXT_ROWS; j++) {
    if (j !== r && rows[j]) loadRow(rows[j], 0, PER_ROW - 1);
  }
}

// Запускаем чуть позже нажатия, чтобы не задерживать саму анимацию фокуса
let timer = 0;
onFocusChange((el) => {
  clearTimeout(timer);
  timer = window.setTimeout(() => preloadAround(el), 60);
});
