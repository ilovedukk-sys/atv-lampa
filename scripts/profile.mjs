/**
 * Профиль процессора по функциям JS прямо на телевизоре (через отладчик webOS).
 * Нужен туннель, как для trace.mjs. Имена функций читаемы, если собрать без сжатия:
 *   set PROFILE=1 && npm run tv
 *
 * node scripts/profile.mjs "<JS-сценарий>" [секунд]
 * Выводит функции, на которые ушло больше всего времени (собственное время и вместе с вложенными).
 */
const PORT = 19998;
const script = process.argv[2] || 'setTimeout(()=>key(40),200); setTimeout(()=>key(13),1200)';
const seconds = Number(process.argv[3] || 3);

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const target = targets.find((t) => t.title === 'Apple TV Lampa');
if (!target) throw new Error('Приложение не запущено на ТВ');

const ws = new WebSocket(target.webSocketDebuggerUrl.replace('127.0.0.1:19998', `127.0.0.1:${PORT}`));
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
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
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 500 });
await send('Profiler.start');
await send('Runtime.evaluate', { expression: script });
await new Promise((r) => setTimeout(r, seconds * 1000));
const res = await send('Profiler.stop');
ws.close();

// ---------- разбор (старый формат Chrome 53: дерево head/children, у узлов hitCount) ----------
const profile = res.result.profile;
// Chrome 53 пишет начало/конец в секундах, новые версии — в микросекундах
const span = profile.endTime - profile.startTime;
const spanUs = span < 1e4 ? span * 1e6 : span;
let sampleCount = (profile.samples || []).length;
if (!sampleCount) {
  const count = (n) => (n.hitCount || 0) + (n.children || []).reduce((s, c) => s + (typeof c === 'object' ? count(c) : 0), 0);
  sampleCount = count(profile.head || profile.nodes[0]);
}
const interval = spanUs / Math.max(1, sampleCount); // мкс на отсчёт
const self = {};
const total = {};
const label = (n) => {
  const f = n.callFrame || n;
  const name = f.functionName || '(анонимная)';
  const file = (f.url || '').split('/').pop();
  return file ? `${name}  ${file}:${(f.lineNumber || 0) + 1}` : name;
};

// Счётчики попаданий: в новом формате — по samples, в старом — hitCount у узлов
const hits = {};
if (profile.samples && profile.nodes) profile.samples.forEach((s) => (hits[s] = (hits[s] || 0) + 1));

function walk(node, stack) {
  const key = label(node);
  const h = node.hitCount !== undefined ? node.hitCount : hits[node.id] || 0;
  self[key] = (self[key] || 0) + h;
  const inStack = stack.indexOf(key) !== -1;
  let sum = h;
  const children = node.children || [];
  const kids = profile.nodes ? children.map((cid) => profile.nodes.find((n) => n.id === cid)) : children;
  kids.forEach((c) => (sum += walk(c, stack.concat(key))));
  if (!inStack) total[key] = (total[key] || 0) + sum;
  return sum;
}
walk(profile.head || profile.nodes[0], []);

const ms = (n) => ((n * interval) / 1000).toFixed(0).padStart(6);
const skip = /^\((root|program|idle|garbage collector)\)/;
console.log('== Собственное время (мс)');
Object.entries(self)
  .filter(([k]) => !skip.test(k))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)
  .forEach(([k, v]) => console.log(`${ms(v)}  ${k}`));
console.log('\n== Вместе с вложенными (мс)');
Object.entries(total)
  .filter(([k]) => !skip.test(k))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)
  .forEach(([k, v]) => console.log(`${ms(v)}  ${k}`));
console.log(`\nСборка мусора: ${ms(self['(garbage collector)'] || 0)} мс, простой: ${ms(self['(idle)'] || 0)} мс`);
