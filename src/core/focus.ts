/**
 * Движок фокуса — замена «Focus Engine» из tvOS.
 *
 * Любой элемент с атрибутом data-focusable можно выбрать пультом.
 * Стрелки ищут ближайший элемент в нужном направлении, Enter «нажимает» на него,
 * Magic Remote (курсор) фокусирует элемент при наведении.
 *
 * Прокрутка сделана через transform (а не обычный scroll) — так плавнее на слабых ТВ:
 *   data-scroll-x — горизонтальная лента (полка с карточками)
 *   data-scroll-y — вертикальная лента всей страницы
 *   data-section  — блок страницы, к которому «прилипает» вертикальная прокрутка
 *   data-focus-group + data-focus-remember — группа, которая помнит последний выбранный элемент
 *   data-screen   — экран (главная, фильм, окно). Стрелки не уводят фокус за пределы экрана
 *   data-sidebar  — боковая панель: открывается влево с крайнего элемента (или «Назад»),
 *                   вправо — возврат в контент туда же, где были
 *
 * При получении фокуса элемент получает событие 'tvfocus' (например, сезон сериала
 * переключается, как только на него навели).
 */

import { sound } from './sound';

export type Direction = 'left' | 'right' | 'up' | 'down';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SAFE_X = 80; // отступ от края экрана, как в tvOS
const SECTION_TOP = 150; // где оказывается полка после прокрутки

let current: HTMLElement | null = null;
const scrollTargets = new Map<HTMLElement, number>();
const remembered = new WeakMap<HTMLElement, HTMLElement>();
const listeners = new Set<(el: HTMLElement) => void>();

export function getFocused() {
  return current;
}

export function onFocusChange(fn: (el: HTMLElement) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * byPointer — фокус от курсора Magic Remote. В этом случае страницу не двигаем:
 * иначе карточка уедет из-под курсора и фокус начнёт «прыгать».
 */
export function focus(el: HTMLElement, byPointer = false) {
  if (el === current) return;
  // Сначала считаем прокрутку (пока раскладка страницы «чистая»), потом меняем классы —
  // так браузеру не приходится пересчитывать раскладку дважды за одно нажатие
  if (!byPointer) ensureVisible(el);

  if (current) current.classList.remove('is-focused');
  current = el;
  el.classList.add('is-focused');

  const group = el.closest('[data-focus-group]') as HTMLElement | null;
  if (group) remembered.set(group, el);
  listeners.forEach((fn) => fn(el));
  el.dispatchEvent(new CustomEvent('tvfocus'));
}

/**
 * Для элементов, у которых класс меняется при перерисовке (вкладки, сезоны):
 * Preact перезаписывает class целиком, поэтому отметку фокуса добавляем сами.
 */
export function focusedClass(el: Element | null) {
  return el && el === current ? ' is-focused' : '';
}

/** Экран, в котором находится элемент (или null, если экранов нет). */
export function screenOf(el: Element | null): HTMLElement | null {
  return el ? (el.closest('[data-screen]') as HTMLElement | null) : null;
}

export function move(dir: Direction) {
  if (!current || !document.body.contains(current)) {
    // Фокус потерялся (элемент удалили) — первый элемент верхнего видимого экрана
    const screens = document.querySelectorAll('[data-screen]:not(.is-hidden)');
    const top = screens.length ? (screens[screens.length - 1] as HTMLElement) : document.body;
    const first = top.querySelector('[data-focusable]') as HTMLElement | null;
    if (first) focus(first);
    return;
  }

  // Боковая панель: вправо — обратно в контент, туда же, где были
  if (current.closest('[data-sidebar]') && dir === 'right') {
    if (leaveSidebar()) sound.move();
    return;
  }

  let next = findNext(current, dir);
  if (!next) {
    // Влево с крайнего элемента — открываем боковую панель (если она есть на экране)
    if (dir === 'left' && !current.closest('[data-sidebar]') && openSidebar()) {
      sound.move();
      return;
    }
    bump(current, dir);
    return;
  }

  // Переход в «запоминающую» группу (например, Tab Bar) — возвращаемся туда, где были
  const group = next.closest('[data-focus-remember]') as HTMLElement | null;
  if (group && !group.contains(current)) {
    const last = remembered.get(group) || (group.querySelector('.is-active') as HTMLElement | null);
    if (last && document.body.contains(last)) next = last;
  }
  focus(next);
  sound.move();
}

/** «ОК»: элемент коротко «проседает» (как нажатие на тачпад Apple TV) и срабатывает. */
export function activate() {
  if (!current) return;
  const el = current;
  el.classList.add('is-pressed');
  setTimeout(() => el.classList.remove('is-pressed'), 180);
  sound.select();
  el.click();
}

// ---------- боковая панель ----------

/** Где был фокус в контенте, когда открыли панель (по экрану). */
const beforeSidebar = new WeakMap<HTMLElement, HTMLElement>();

/** Открыть боковую панель экрана: фокус на текущий раздел. */
export function openSidebar(screenEl?: HTMLElement | null): boolean {
  const screen = screenEl || screenOf(current);
  const bar = screen && (screen.querySelector('[data-sidebar]') as HTMLElement | null);
  if (!screen || !bar) return false;
  if (current && !current.closest('[data-sidebar]') && screenOf(current) === screen) beforeSidebar.set(screen, current);
  focusFirstIn(bar);
  return true;
}

/** Закрыть панель: вернуть фокус в контент. */
function leaveSidebar(): boolean {
  const screen = screenOf(current);
  if (!screen) return false;
  const back = beforeSidebar.get(screen);
  if (back && document.body.contains(back) && back.offsetParent !== null) {
    focus(back);
    return true;
  }
  const first = screen.querySelector('[data-scroll-y] [data-focusable]') as HTMLElement | null;
  if (first) focus(first);
  return !!first;
}

/** Перевести фокус на первый (или запомненный) элемент внутри блока. */
export function focusFirstIn(selector: string | HTMLElement | null) {
  const root = (typeof selector === 'string' ? document.querySelector(selector) : selector) as HTMLElement | null;
  if (!root) return;
  const target =
    (root.hasAttribute('data-focus-remember') &&
      (remembered.get(root) || (root.querySelector('.is-active') as HTMLElement | null))) ||
    (root.querySelector('[data-focusable]') as HTMLElement | null);
  if (target) focus(target);
}

// ---------- поиск соседа ----------

/**
 * Кого вообще рассматривать. На главной ~150 карточек, а слабому ТВ дорого измерять каждую
 * на каждое нажатие — поэтому смотрим только на соседей:
 *   влево/вправо — тот же ряд (раздел страницы или группа);
 *   вверх/вниз   — текущий раздел и соседние сверху/снизу; в боковой панели — её пункты.
 */
function candidates(from: HTMLElement, dir: Direction): ArrayLike<Element> {
  const screen = screenOf(from) || document.body;
  const bar = from.closest('[data-sidebar]');
  if (bar) return bar.querySelectorAll('[data-focusable]'); // в панели — только её пункты
  const section = from.closest('[data-section]');
  const page = from.closest('[data-scroll-y]');

  if (dir === 'left' || dir === 'right') {
    const row = section || from.closest('[data-focus-group]');
    return (row || screen).querySelectorAll('[data-focusable]');
  }
  if (!section || !page) return screen.querySelectorAll('[data-focusable]');

  const sections = page.querySelectorAll('[data-section]');
  let idx = 0;
  for (let i = 0; i < sections.length; i++) if (sections[i] === section) idx = i;
  const out: Element[] = [];
  const add = (list: ArrayLike<Element>) => {
    for (let i = 0; i < list.length; i++) out.push(list[i]);
  };
  for (let j = idx - 1; j <= idx + 1; j++) {
    if (sections[j]) add(sections[j].querySelectorAll('[data-focusable]'));
  }
  return out;
}

function findNext(from: HTMLElement, dir: Direction): HTMLElement | null {
  const a = layoutRect(from);
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const all = candidates(from, dir);
  const screen = screenOf(from);

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < all.length; i++) {
    const el = all[i] as HTMLElement;
    if (el === from || el.offsetParent === null) continue;
    if (screenOf(el) !== screen) continue;
    const b = layoutRect(el);
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;

    let main: number; // расстояние по направлению движения
    let side: number; // смещение вбок
    switch (dir) {
      case 'right':
        if (b.x < a.x + a.w - 2 || !sameRow(a, b)) continue;
        main = b.x - (a.x + a.w);
        side = Math.abs(bcy - acy);
        break;
      case 'left':
        if (b.x + b.w > a.x + 2 || !sameRow(a, b)) continue;
        main = a.x - (b.x + b.w);
        side = Math.abs(bcy - acy);
        break;
      case 'down':
        if (b.y < a.y + a.h - 2) continue;
        main = b.y - (a.y + a.h);
        side = Math.abs(bcx - acx);
        break;
      default:
        if (b.y + b.h > a.y + 2) continue;
        main = a.y - (b.y + b.h);
        side = Math.abs(bcx - acx);
    }
    // Вбок «штрафуем» сильнее, чтобы фокус шёл прямо, а не по диагонали
    const score = Math.max(main, 0) + side * (dir === 'left' || dir === 'right' ? 4 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** Влево/вправо — только в пределах своего ряда (элементы перекрываются по высоте), как в tvOS. */
function sameRow(a: Rect, b: Rect) {
  return b.y < a.y + a.h && b.y + b.h > a.y;
}

/**
 * Положение элемента «как будет после прокрутки».
 * offsetLeft/offsetTop не учитывают transform, поэтому анимация прокрутки
 * не сбивает навигацию, если быстро жать на кнопки.
 */
function layoutRect(el: HTMLElement): Rect {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && !node.hasAttribute('data-stage')) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  let p: HTMLElement | null = el.parentElement;
  while (p) {
    const t = scrollTargets.get(p);
    if (t !== undefined) {
      if (p.hasAttribute('data-scroll-x')) x -= t;
      else y -= t;
    }
    p = p.parentElement;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

// ---------- прокрутка ----------

function ensureVisible(el: HTMLElement) {
  const track = el.closest('[data-scroll-x]') as HTMLElement | null;
  if (track && track.parentElement) {
    const view = track.parentElement.offsetWidth;
    const max = Math.max(0, track.offsetWidth - view);
    let t = scrollTargets.get(track) || 0;
    const left = offsetWithin(el, track);
    const right = left + el.offsetWidth;
    if (left - t < SAFE_X) t = left - SAFE_X;
    else if (right - t > view - SAFE_X) t = right - view + SAFE_X;
    setScroll(track, Math.min(max, Math.max(0, t)), 'x');
  }

  const page = el.closest('[data-scroll-y]') as HTMLElement | null;
  if (page) {
    const section = el.closest('[data-section]') as HTMLElement | null;
    const top = section ? offsetWithin(section, page, 'y') : 0;
    const t = section && section.hasAttribute('data-section-top') ? 0 : Math.max(0, top - SECTION_TOP);
    setScroll(page, t, 'y');
    const screen = screenOf(el);
    if (screen) screen.classList.toggle('is-scrolled', t > 0);
  } else if (!el.closest('[data-sidebar]')) {
    // Панель выезжает поверх контента — прокрутку страницы не трогаем
    const screen = screenOf(el);
    if (screen) screen.classList.remove('is-scrolled');
  }
}

function offsetWithin(el: HTMLElement, ancestor: HTMLElement, axis: 'x' | 'y' = 'x') {
  let v = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    v += axis === 'x' ? node.offsetLeft : node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return v;
}

function setScroll(el: HTMLElement, value: number, axis: 'x' | 'y') {
  if (scrollTargets.get(el) === value) return;
  scrollTargets.set(el, value);
  el.style.transform = axis === 'x' ? `translate3d(${-value}px,0,0)` : `translate3d(0,${-value}px,0)`;
}

/** «Упор» — карточка чуть дёргается, когда дальше идти некуда (как в tvOS). */
function bump(el: HTMLElement, dir: Direction) {
  sound.bump();
  const cls = 'bump-' + dir;
  el.classList.remove(cls);
  void el.offsetWidth; // перезапуск CSS-анимации
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 300);
}

// ---------- пульт, клавиатура, Magic Remote ----------

export const KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  BACK_WEBOS: 461,
  ESC: 27,
  BACKSPACE: 8,
};

/*
 * Кнопка «Назад»: каждый открытый экран/окно регистрирует свой обработчик,
 * срабатывает самый верхний. Если обработчиков нет — onBack из startFocusEngine.
 */
const backHandlers: Array<() => void> = [];

export function pushBackHandler(fn: () => void) {
  backHandlers.push(fn);
  return () => {
    const i = backHandlers.lastIndexOf(fn);
    if (i !== -1) backHandlers.splice(i, 1);
  };
}

let fallbackBack: () => void = () => {};

/** Нажатие «Назад» (пульт, Esc или замер плавности). */
export function back() {
  sound.back();
  if (backHandlers.length) backHandlers[backHandlers.length - 1]();
  else fallbackBack();
}

let pointerLive = false;

/** Двигали ли курсор Magic Remote после последнего нажатия кнопки пульта. */
export function isPointerLive() {
  return pointerLive;
}

export function startFocusEngine(onBack: () => void) {
  fallbackBack = onBack;
  document.addEventListener('keydown', (e) => {
    pointerLive = false; // нажали кнопку пульта — курсор больше не управляет фокусом
    switch (e.keyCode) {
      case KEY.LEFT: move('left'); break;
      case KEY.RIGHT: move('right'); break;
      case KEY.UP: move('up'); break;
      case KEY.DOWN: move('down'); break;
      case KEY.ENTER: activate(); break;
      case KEY.BACK_WEBOS:
      case KEY.ESC:
      case KEY.BACKSPACE:
        back();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  /*
   * Magic Remote / мышь: наведение = фокус, но только при НАСТОЯЩЕМ движении курсора.
   * Когда страница проезжает под неподвижным курсором, браузер присылает «наведение»
   * без движения — его игнорируем, иначе фокус перескакивал бы на карточку под курсором.
   */
  let lastX = -1;
  let lastY = -1;
  document.addEventListener('mousemove', (e) => {
    if (e.clientX === lastX && e.clientY === lastY) return;
    const first = lastX === -1; // первое событие после запуска — только запоминаем, где курсор
    lastX = e.clientX;
    lastY = e.clientY;
    if (first) return;
    pointerLive = true;
    const el = (e.target as HTMLElement).closest('[data-focusable]') as HTMLElement | null;
    if (el) focus(el, true);
  });
  // webOS сама прячет курсор после нажатия кнопок — тогда он тоже не управляет фокусом
  document.addEventListener('cursorStateChange', (e: any) => {
    if (e.detail && e.detail.visibility === false) pointerLive = false;
  });

  // Колёсико Magic Remote листает полки вверх-вниз
  let lastWheel = 0;
  document.addEventListener('wheel', (e) => {
    const now = Date.now();
    if (now - lastWheel < 250) return;
    lastWheel = now;
    move(e.deltaY > 0 ? 'down' : 'up');
  });
}
