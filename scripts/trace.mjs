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

await send('Runtime.evaluate', { expression: KEY_FN });
await send('Tracing.start', {
  categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,gpu,v8,toplevel,disabled-by-default-devtools.timeline.frame',
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
