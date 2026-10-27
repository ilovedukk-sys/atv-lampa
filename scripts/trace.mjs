/**
 * Профилирование приложения прямо на телевизоре (через отладчик браузера webOS).
 * Нужен туннель: ssh -i ~/.ssh/webos_tv -N -L 19998:127.0.0.1:9998 root@<IP ТВ>
 *
 * node scripts/trace.mjs "<JS-сценарий>" [секунд]
 * Сценарий выполняется в приложении; удобная функция key(код) «нажимает» кнопку пульта.
 * Выводит, на что ушло время в главном потоке и потоках отрисовки.
 */
const PORT = 19998;
const script = process.argv[2] || 'for (let i=0;i<4;i++) setTimeout(()=>key(40), 300 + i*450)';
const seconds = Number(process.argv[3] || 3);

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const target = targets.find((t) => t.title === 'Apple TV Lampa');
if (!target) throw new Error('Приложение не запущено на ТВ');

const ws = new WebSocket(target.webSocketDebuggerUrl.replace('127.0.0.1:19998', `127.0.0.1:${PORT}`));
await new Promise((r) => ws.addEventListener('open', r));

let id = 0;
const pending = new Map();
const events = [];
let done;
const complete = new Promise((r) => (done = r));
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  if (msg.method === 'Tracing.dataCollected') events.push(...msg.params.value);
  if (msg.method === 'Tracing.tracingComplete') done();
});
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

const KEY_FN =
  "window.key=function(c){var e=document.createEvent('Event');e.initEvent('keydown',true,true);e.keyCode=c;" +
  "try{Object.defineProperty(e,'keyCode',{get:function(){return c}})}catch(x){}document.dispatchEvent(e)};";

// TRACE_QUADS=1 — вместо времени: какие слои и какой площадью видеочип рисует в кадре (см. разбор в конце)
const QUADS = !!process.env.TRACE_QUADS;

await send('Runtime.evaluate', { expression: KEY_FN });
await send('Tracing.start', {
  categories: QUADS
    ? 'disabled-by-default-cc.debug.quads,disabled-by-default-cc.debug,cc'
    : 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,gpu,v8,toplevel,disabled-by-default-devtools.timeline.frame',
  transferMode: 'ReportEvents',
});
await send('Runtime.evaluate', { expression: script });
await new Promise((r) => setTimeout(r, seconds * 1000));
await send('Tracing.end');
await complete;
ws.close();

// Сырые события — для подробного разбора по времени (TRACE_OUT=файл.json)
if (process.env.TRACE_OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.TRACE_OUT, JSON.stringify(events));
}

/*
 * Квады кадра из середины трейса: по каждому слою — размер, площадь на экране (в экранах 1920×1080),
 * сколько из неё с прозрачностью и сколько сплошным цветом (сплошное почти бесплатно, текстуры — нет).
 * Так нашли слой страницы, который из-за пары строк текста рисовался на весь экран.
 */
if (QUADS) {
  const frames = events.filter((e) => e.ph === 'O' && e.args && e.args.snapshot && JSON.stringify(e.args.snapshot).indexOf('quad_list') !== -1);
  if (!frames.length) throw new Error('В трейсе нет квадов — сценарий ничего не сдвинул?');
  const find = (o, k, out) => {
    if (o && typeof o === 'object') {
      if (o[k]) out.push(o[k]);
      for (const v of Object.values(o)) find(v, k, out);
    }
    return out;
  };
  const S = 1920 * 1080;
  const area = (r) => {
    const xs = [r[0], r[2], r[4], r[6]], ys = [r[1], r[3], r[5], r[7]];
    return Math.max(0, Math.min(Math.max(...xs), 1920) - Math.max(Math.min(...xs), 0)) * Math.max(0, Math.min(Math.max(...ys), 1080) - Math.max(Math.min(...ys), 0));
  };
  const pass = find(frames[Math.floor(frames.length / 2)].args.snapshot, 'render_passes', [])[0][0];
  const states = {};
  pass.shared_quad_state_list.forEach((q) => (states[q.id.split('/')[1]] = q));
  const by = {};
  pass.quad_list.forEach((q) => {
    const v = (by[q.shared_state.id_ref] = by[q.shared_state.id_ref] || { px: 0, blend: 0, solid: 0 });
    const a = area(q.visible_rect_as_target_space_quad || q.rect_as_target_space_quad);
    v.px += a;
    if (q.should_draw_with_blending) v.blend += a;
    if (q.material === 5) v.solid += a; // SolidColor
  });
  let total = 0;
  console.log('Слой (размер, сдвиг)           на экране  с прозрачн.  сплошным');
  Object.entries(by).forEach(([id, v]) => {
    const st = states[id] || {}, b = st.layer_content_bounds || {}, t = st.transform || [];
    total += v.px;
    const f = (x) => (x / S).toFixed(2).padStart(9);
    console.log(`  ${`${b.width}×${b.height}`.padEnd(12)} x${Math.round(t[3])} y${Math.round(t[7])}`.padEnd(32) + f(v.px) + f(v.blend) + f(v.solid));
  });
  console.log(`Всего за кадр: ${(total / S).toFixed(2)} экрана`);
  process.exit(0);
}

// ---------- разбор ----------
const threadNames = {};
events.filter((e) => e.ph === 'M' && e.name === 'thread_name').forEach((e) => (threadNames[e.pid + ':' + e.tid] = e.args.name));

const byThread = {};
events
  .filter((e) => e.ph === 'X' && e.dur)
  .forEach((e) => {
    const t = threadNames[e.pid + ':' + e.tid] || e.tid;
    const bucket = (byThread[t] = byThread[t] || {});
    bucket[e.name] = bucket[e.name] || { ms: 0, n: 0, max: 0 };
    bucket[e.name].ms += e.dur / 1000;
    bucket[e.name].n++;
    bucket[e.name].max = Math.max(bucket[e.name].max, e.dur / 1000);
  });

for (const [thread, names] of Object.entries(byThread)) {
  const rows = Object.entries(names).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
  const total = rows.reduce((s, r) => s + r[1].ms, 0);
  if (total < 20) continue;
  console.log(`\n== ${thread}`);
  rows.forEach(([n, v]) => console.log(`  ${v.ms.toFixed(0).padStart(6)} мс  ×${String(v.n).padStart(4)}  макс ${v.max.toFixed(0).padStart(4)}  ${n}`));
}

// Кадры: сколько раз главный поток был занят дольше 50 мс
const main = Object.keys(threadNames).find((k) => threadNames[k] === 'CrRendererMain');
const long = events.filter((e) => e.ph === 'X' && e.pid + ':' + e.tid === main && e.dur > 50000 && e.name === 'ThreadControllerImpl::RunTask' || (e.ph === 'X' && e.pid + ':' + e.tid === main && e.dur > 50000 && /Task|RunTask/.test(e.name)));
console.log(`\nДолгих задач главного потока (>50 мс): ${long.length}`);

/*
 * Кадры на экране — то, что видит зритель (Display::DrawAndSwap). Счётчик tv:bench считает кадры
 * главного потока, а сдвиги и увеличение идут в отдельном потоке: на экране бывает заметно плавнее
 * (или наоборот — рывок есть, а счётчик его не видит).
 */
// Окно — от первого нажатия до конца анимации последнего (в покое кадров нет, паузы там не рывки)
const keys = events
  .filter((e) => e.name === 'EventDispatch' && e.args && e.args.data && e.args.data.type === 'keydown')
  .map((e) => e.ts)
  .sort((a, b) => a - b);
const from = keys.length ? keys[0] : 0;
const to = keys.length ? keys[keys.length - 1] + 700000 : Infinity;
const swaps = events
  .filter((e) => e.ph === 'X' && e.name === 'Display::DrawAndSwap' && e.ts >= from && e.ts <= to)
  .map((e) => e.ts)
  .sort((a, b) => a - b);
if (swaps.length > 1) {
  const gaps = swaps.slice(1).map((t, i) => (t - swaps[i]) / 1000).sort((a, b) => b - a);
  const fps = (gaps.length * 1e6) / (swaps[swaps.length - 1] - swaps[0]);
  console.log(
    `Кадры на экране: ${fps.toFixed(0)}/с, худшие интервалы ${gaps.slice(0, 3).map((g) => g.toFixed(0)).join('/')} мс, ` +
      `рывков (>33 мс): ${gaps.filter((g) => g > 33).length}`,
  );
}
