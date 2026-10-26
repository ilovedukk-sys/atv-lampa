/**
 * Уровень эффектов — для телевизоров разной силы (классы на <html>, см. app.css):
 *   «Все»          — как в Apple TV;
 *   «Облегчённый»  — html.lite: без размытого фона, блика, полоски прогресса и выплывания;
 *   «Минимальный»  — html.lite.ultra: для совсем слабых ТВ — ещё и без анимаций, теней и стекла,
 *                    обложки низкого качества, Top Shelf не листается сам, ничего не готовится заранее.
 * Переключается зелёной кнопкой пульта (на компьютере — F4) по кругу, выбор запоминается.
 */
export type Effects = 'full' | 'lite' | 'ultra';

export const EFFECTS_LABELS: Record<Effects, string> = {
  full: 'Все',
  lite: 'Облегчённый',
  ultra: 'Минимальный',
};

const root = document.documentElement;
let level: Effects = 'full';

try {
  const saved = localStorage.getItem('effects') as Effects | null;
  if (saved && EFFECTS_LABELS[saved]) level = saved;
  else if (localStorage.getItem('lite') === '1') level = 'lite'; // настройка прежних версий
} catch (e) {
  /* без запоминания */
}
apply();

function apply() {
  root.classList.toggle('lite', level !== 'full');
  root.classList.toggle('ultra', level === 'ultra');
}

export function getEffects() {
  return level;
}

/** Следующий уровень по кругу: все → облегчённый → минимальный → все. */
export function cycleEffects(): Effects {
  level = level === 'full' ? 'lite' : level === 'lite' ? 'ultra' : 'full';
  apply();
  try {
    localStorage.setItem('effects', level);
  } catch (e) {
    /* без запоминания */
  }
  return level;
}

export function isLite() {
  return level !== 'full';
}

/** Минимальный режим: JS тоже экономит (без автолистания, подготовки заранее, наклона). */
export function isUltra() {
  return level === 'ultra';
}
