/**
 * Облегчённый режим: выключает тяжёлые для слабого ТВ эффекты (класс html.lite в app.css).
 * Переключается зелёной кнопкой пульта (на компьютере — F4), выбор запоминается.
 */
const root = document.documentElement;

try {
  if (localStorage.getItem('lite') === '1') root.classList.add('lite');
} catch (e) {
  /* без запоминания */
}

export function toggleLite() {
  const on = root.classList.toggle('lite');
  try {
    localStorage.setItem('lite', on ? '1' : '0');
  } catch (e) {
    /* без запоминания */
  }
  return on;
}

export function isLite() {
  return root.classList.contains('lite');
}
