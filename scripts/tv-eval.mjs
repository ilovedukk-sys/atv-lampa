/**
 * Выполнить JS в приложении на ТВ (через отладчик; нужен туннель, см. scripts/trace.mjs).
 * В коде доступна key(код) — «нажать» кнопку пульта. Пример: node scripts/tv-eval.mjs "key(37)"
 */
const PORT = 19998;
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const target = targets.find((t) => t.title === 'ATV Lampa');
if (!target) throw new Error('Приложение не запущено на ТВ');
const ws = new WebSocket(target.webSocketDebuggerUrl.replace('127.0.0.1:19998', `127.0.0.1:${PORT}`));
await new Promise((r) => ws.addEventListener('open', r));
const KEY_FN =
  "window.key=function(c){var e=document.createEvent('Event');e.initEvent('keydown',true,true);e.keyCode=c;" +
  "try{Object.defineProperty(e,'keyCode',{get:function(){return c}})}catch(x){}document.dispatchEvent(e)};";
const done = new Promise((r) => ws.addEventListener('message', (m) => JSON.parse(m.data).id === 1 && r(JSON.parse(m.data))));
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: KEY_FN + process.argv[2], returnByValue: true } }));
const res = await done;
console.log(JSON.stringify(res.result && res.result.result && res.result.result.value));
ws.close();
