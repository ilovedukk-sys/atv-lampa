/**
 * Автоматический замер плавности. Сам «нажимает» кнопки пульта по сценариям,
 * сравнивает несколько вариантов настроек отрисовки и показывает таблицу на экране.
 *
 * Запуск на ТВ: npm run tv:bench   (приложение стартует с параметром {"bench":1})
 * В браузере:   http://localhost:5173/?bench
 */
import { activate, back, focus, focusFirstIn, move, type Direction } from './focus';
import { artStats, clearArtCache } from './artImage';

interface Config {
  name: string;
  cls: string; // класс на <html>, см. app.css
}

const CONFIGS: Config[] = [
  { name: 'Эффекты', cls: '' },
  { name: 'Облегчённый', cls: 'lite' },
];

interface Scenario {
  name: string;
  setup: () => void;
  action: (js: number[]) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const press = async (js: number[], dir: Direction, times: number, interval: number) => {
  for (let i = 0; i < times; i++) {
    const t = performance.now();
    move(dir);
    js.push(performance.now() - t);
    await wait(interval);
  }
};

const firstCard = (shelfIndex: number) => {
  const shelf = document.querySelectorAll('.shelf')[shelfIndex];
  const card = shelf && (shelf.querySelector('[data-focusable]') as HTMLElement | null);
  if (card) focus(card);
};

/** Сдвигаем элемент напрямую, без фокуса — чтобы измерить «чистую» прокрутку. */
const slide = async (el: HTMLElement, a: string, b: string) => {
  const original = el.style.transform;
  el.style.transform = a;
  await wait(700);
  el.style.transform = b;
  await wait(700);
  el.style.transform = original;
};

const SCENARIOS: Scenario[] = [
  { name: 'Вниз по полкам', setup: () => focusFirstIn('[data-hero]'), action: (js) => press(js, 'down', 4, 450) },
  { name: 'Вверх к Top Shelf', setup: () => {}, action: (js) => press(js, 'up', 4, 450) },
  { name: 'Вправо: постеры', setup: () => firstCard(1), action: (js) => press(js, 'right', 6, 300) },
  {
    name: 'Только прокрутка стр.',
    setup: () => focusFirstIn('[data-hero]'),
    action: () =>
      slide(document.querySelector('.page') as HTMLElement, 'translate3d(0,-640px,0)', 'translate3d(0,0,0)'),
  },
  {
    name: 'Только сдвиг полки',
    setup: () => focusFirstIn('[data-hero]'),
    action: () =>
      slide(document.querySelector('.shelf__track') as HTMLElement, 'translate3d(-880px,0,0)', 'translate3d(0,0,0)'),
  },
  {
    name: 'Открыть фильм',
    setup: () => {
      firstCard(0);
      clearArtCache(); // каждый вариант честно рисует картинки экрана заново
      artStats.count = 0;
      artStats.ms = 0;
    },
    action: async (js) => {
      activate();
      await wait(1100);
      js.push(artStats.ms); // в колонке js — время рисования картинок-заглушек
    },
  },
  { name: 'Вниз к сериям', setup: () => {}, action: (js) => press(js, 'down', 2, 450) },
  { name: 'Вправо: серии', setup: () => {}, action: (js) => press(js, 'right', 4, 300) },
  {
    name: 'Назад на главную',
    setup: () => {},
    action: async (js) => {
      const t = performance.now();
      back();
      js.push(performance.now() - t);
      await wait(900);
    },
  },
  {
    name: 'Смена слайда',
    setup: () => focusFirstIn('[data-hero]'),
    action: async () => {
      window.dispatchEvent(new CustomEvent('bench-next-slide'));
      await wait(1300);
    },
  },
];

interface Cell {
  fps: number;
  worst: number;
  js: number;
}

async function measure(s: Scenario): Promise<Cell> {
  s.setup();
  await wait(900); // даём закончиться анимациям от подготовки

  const frames: number[] = [];
  let measuring = true;
  let last = 0;
  const tick = (now: number) => {
    if (last) frames.push(now - last);
    last = now;
    if (measuring) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const start = performance.now();
  const js: number[] = [];
  await s.action(js);
  await wait(600); // хвост анимации
  measuring = false;
  const total = performance.now() - start;

  return {
    fps: Math.round((frames.length * 1000) / total),
    worst: Math.round(frames.length ? Math.max.apply(null, frames) : 0),
    js: js.length ? Math.round(js.reduce((a, b) => a + b, 0) / js.length) : 0,
  };
}

function show(table: Cell[][], done: boolean) {
  let box = document.querySelector('.bench') as HTMLDivElement | null;
  if (!box) {
    box = document.createElement('div');
    box.className = 'bench';
    document.body.appendChild(box);
  }
  const color = (fps: number) => (fps >= 45 ? '#7CFC9A' : fps >= 30 ? '#FFD36B' : '#FF7B7B');
  const head = CONFIGS.map((c) => `<th>${c.name}</th>`).join('');
  const rows = SCENARIOS.map((s, si) => {
    const cells = CONFIGS.map((_, ci) => {
      const c = table[ci] && table[ci][si];
      return c
        ? `<td><b style="color:${color(c.fps)}">${c.fps}</b> <span>${c.worst}мс${c.js ? ' · js ' + c.js : ''}</span></td>`
        : '<td>…</td>';
    }).join('');
    return `<tr><td>${s.name}</td>${cells}</tr>`;
  }).join('');
  box.innerHTML =
    `<div class="bench__title">Замер плавности ${done ? '— готово' : '…'}</div>` +
    `<div class="bench__hint">FPS · худший кадр · время JS на нажатие</div>` +
    `<table><tr><th>Сценарий</th>${head}</tr>${rows}</table>`;
}

export async function runBenchmark() {
  const table: Cell[][] = [];
  const root = document.documentElement;
  const userLite = root.classList.contains('lite');
  root.classList.remove('lite');
  show(table, false);
  // Разогрев: первый проход после запуска всегда медленнее (картинки, слои) — его не считаем
  await measure(SCENARIOS[0]);
  await measure(SCENARIOS[1]);
  for (const cfg of CONFIGS) {
    CONFIGS.forEach((c) => c.cls && root.classList.remove(c.cls));
    if (cfg.cls) root.classList.add(cfg.cls);
    await wait(800);
    const row: Cell[] = [];
    table.push(row);
    for (const s of SCENARIOS) {
      row.push(await measure(s));
      show(table, false);
    }
  }
  CONFIGS.forEach((c) => c.cls && root.classList.remove(c.cls));
  if (userLite) root.classList.add('lite');
  show(table, true);
  console.log('BENCH ' + JSON.stringify(table));
  focusFirstIn('[data-hero]');
}

/** Параметр запуска webOS (ares-launch -p '{"имя":значение}') или ?имя=значение в адресе. */
export function launchParam(name: string): string | null {
  const m = new RegExp('[?&]' + name + '(=([^&]*))?').exec(location.search);
  if (m) return m[2] || '1';
  const ps = (window as any).PalmSystem;
  if (ps && ps.launchParams) {
    try {
      const v = JSON.parse(ps.launchParams)[name];
      return v === undefined ? null : String(v);
    } catch (e) {
      return null;
    }
  }
  return null;
}

/** Запускать ли замер: параметр запуска webOS {"bench":1} или ?bench в адресе. */
export function benchRequested(): boolean {
  return launchParam('bench') !== null;
}
