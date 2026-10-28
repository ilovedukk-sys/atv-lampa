/**
 * Заставка, как на Apple TV: если долго не нажимать кнопки, на весь экран идут кадры фильмов.
 * Здесь — настройка «через сколько минут» и слежение за бездействием; сама заставка — components/Screensaver.tsx.
 *
 * Бездействие проверяем раз в 10 с по времени последнего нажатия: таймер на каждое движение
 * Magic Remote (десятки событий в секунду) не пересоздаём.
 */

const KEY = 'saverMin';
export const SAVER_OPTIONS = [2, 5, 10, 15, 0]; // 0 — выключена
const DEFAULT_MIN = 5;
const CHECK_MS = 10000;

let minutes = DEFAULT_MIN;
try {
  const saved = localStorage.getItem(KEY);
  if (saved !== null && SAVER_OPTIONS.indexOf(Number(saved)) !== -1) minutes = Number(saved);
} catch (e) {
  /* по умолчанию — 5 минут */
}

export function saverMinutes() {
  return minutes;
}

export function saverLabel(min = minutes) {
  return min ? `Через ${min} мин` : 'Выкл.';
}

/** Следующий вариант по кругу: 2 → 5 → 10 → 15 → выкл. → 2. */
export function cycleSaver() {
  minutes = SAVER_OPTIONS[(SAVER_OPTIONS.indexOf(minutes) + 1) % SAVER_OPTIONS.length];
  try {
    localStorage.setItem(KEY, String(minutes));
  } catch (e) {
    /* без запоминания */
  }
  lastActive = Date.now();
  return minutes;
}

let lastActive = Date.now();

/** Отметить действие пользователя (нажатие, движение указателя). */
export function markActive() {
  lastActive = Date.now();
}

/**
 * Следить за бездействием. canStart — можно ли сейчас (не во время видео); onIdle — включить заставку.
 * Возвращает функцию остановки.
 */
export function watchIdle(canStart: () => boolean, onIdle: () => void) {
  const events = ['keydown', 'mousemove', 'mousedown', 'wheel'];
  events.forEach((e) => window.addEventListener(e, markActive, true));
  const timer = setInterval(() => {
    if (!minutes || document.hidden) return;
    if (Date.now() - lastActive < minutes * 60000) return;
    if (canStart()) onIdle();
    else markActive(); // смотрят видео — отсчёт заново после него
  }, CHECK_MS);
  return () => {
    clearInterval(timer);
    events.forEach((e) => window.removeEventListener(e, markActive, true));
  };
}
