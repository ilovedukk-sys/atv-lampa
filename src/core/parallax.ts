/**
 * Параллакс-наклон карточки, как на Apple TV при касании тачпада.
 * На LG его даёт Magic Remote: карточка наклоняется вслед за курсором,
 * фон и надпись внутри смещаются в разные стороны, по стеклу бежит блик.
 */
import { getFocused, onFocusChange } from './focus';

const MAX_TILT = 6; // градусов
let tilted: HTMLElement | null = null;
let frame = 0;

export function tiltTo(card: HTMLElement, x: number, y: number) {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const tilt = card.querySelector('.card__tilt') as HTMLElement | null;
    const bg = card.querySelector('.art__bg') as HTMLElement | null;
    const logo = card.querySelector('.art__logo') as HTMLElement | null;
    const shine = card.querySelector('.card__shine') as HTMLElement | null;
    if (!tilt) return;
    tilted = card;
    card.classList.add('is-tilting');
    tilt.style.transform =
      `perspective(900px) scale(1.1) rotateX(${(-y * MAX_TILT).toFixed(2)}deg) rotateY(${(x * MAX_TILT).toFixed(2)}deg)`;
    if (bg) bg.style.transform = `scale(1.08) translate3d(${(-x * 10).toFixed(1)}px,${(-y * 8).toFixed(1)}px,0)`;
    if (logo) logo.style.transform = `translate3d(${(x * 8).toFixed(1)}px,${(y * 6).toFixed(1)}px,0)`;
    if (shine) shine.style.transform = `translate3d(${(x * 35).toFixed(1)}%,${(y * 35).toFixed(1)}%,0)`;
  });
}

export function resetTilt(card: HTMLElement | null) {
  if (!card) return;
  cancelAnimationFrame(frame);
  card.classList.remove('is-tilting');
  const nodes = card.querySelectorAll('.card__tilt, .art__bg, .art__logo, .card__shine');
  for (let i = 0; i < nodes.length; i++) (nodes[i] as HTMLElement).style.transform = '';
  if (tilted === card) tilted = null;
}

/** Подключает наклон к карточке. Возвращает функцию отключения. */
export function attachParallax(card: HTMLElement) {
  const onMove = (e: MouseEvent) => {
    if (!card.classList.contains('is-focused')) return;
    const r = card.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    tiltTo(card, x, y);
  };
  const onLeave = () => resetTilt(card);
  card.addEventListener('mousemove', onMove);
  card.addEventListener('mouseleave', onLeave);
  return () => {
    card.removeEventListener('mousemove', onMove);
    card.removeEventListener('mouseleave', onLeave);
  };
}

// Фокус ушёл — выпрямляем предыдущую карточку
onFocusChange((el) => {
  if (tilted && tilted !== el) resetTilt(tilted);
});

/*
 * Отблеск по карточке (см. .is-shining в app.css): запускаем, только если на карточке
 * задержались — при быстром листании он не нужен и только отнимал бы кадры.
 * На главной (вкладки «Главная», «Фильмы», «Сериалы»…) блика нет — так решили по вкусу.
 */
const SHINE_DELAY_MS = 350;
const SHINE_MS = 850;
let shineTimer = 0;
onFocusChange((el) => {
  clearTimeout(shineTimer);
  if (!el.classList.contains('card') || el.closest('.home')) return;
  shineTimer = window.setTimeout(() => {
    if (getFocused() !== el) return;
    el.classList.add('is-shining');
    setTimeout(() => el.classList.remove('is-shining'), SHINE_MS);
  }, SHINE_DELAY_MS);
});
