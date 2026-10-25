/**
 * Счётчик кадров в секунду для проверки плавности на телевизоре.
 * Включается/выключается КРАСНОЙ кнопкой пульта (на компьютере — F2).
 * После перезапуска приложения выключен (он сам нагружает процессор).
 * Показывает текущий FPS и самый низкий за последние 5 секунд.
 * 60 — идеально, 45+ — нормально, ниже 30 — заметные лаги.
 */

const RED_BUTTON = 403;
const KEY_F2 = 113; // на компьютере — F2 (буква F нужна для поиска)

let box: HTMLDivElement | null = null;
let running = false;

function loop() {
  let frames = 0;
  let last = performance.now();
  let windowStart = last;
  let worst = 60;

  const tick = (now: number) => {
    if (!running || !box) return;
    frames++;
    if (now - last >= 500) {
      const fps = Math.round((frames * 1000) / (now - last));
      if (now - windowStart > 5000) {
        worst = fps;
        windowStart = now;
      }
      worst = Math.min(worst, fps);
      box.textContent = `${fps} fps · мин ${worst}`;
      box.style.color = fps >= 45 ? '#7CFC9A' : fps >= 30 ? '#FFD36B' : '#FF7B7B';
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Показан ли счётчик (для экрана «Настройки»). */
export function fpsOn() {
  return running;
}

export function toggleFps() {
  toggle();
  return running;
}

function toggle() {
  running = !running;
  if (running) {
    box = document.createElement('div');
    box.className = 'fps';
    box.textContent = '… fps';
    document.body.appendChild(box);
    loop();
  } else if (box) {
    box.parentNode!.removeChild(box);
    box = null;
  }
}

export function startFpsMeter() {
  document.addEventListener('keydown', (e) => {
    if (e.keyCode === RED_BUTTON || e.keyCode === KEY_F2) toggle();
  });
  // Не запоминаем между запусками: счётчик сам по себе грузит процессор ТВ
  try {
    localStorage.removeItem('fps');
  } catch (e) {
    /* ignore */
  }
}
