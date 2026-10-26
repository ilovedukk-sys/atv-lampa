/**
 * Сколько слоёв отрисовки сейчас у приложения на ТВ и почему они появились.
 * Нужен туннель к отладчику (см. scripts/trace.mjs).
 * node scripts/layers.mjs ["CSS для опыта"]
 */
const PORT = 19998;
const variant = process.argv[2] || '';

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const target = targets.find((t) => t.title === 'Apple TV Lampa');
const ws = new WebSocket(target.webSocketDebuggerUrl.replace('127.0.0.1:19998', `127.0.0.1:${PORT}`));
await new Promise((r) => ws.addEventListener('open', r));

let id = 0;
const pending = new Map();
let lastLayers = null;
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  if (msg.method === 'LayerTree.layerTreeDidChange' && msg.params.layers) lastLayers = msg.params.layers;
});
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Runtime.evaluate', {
  expression: `(function(){var s=document.getElementById('exp-css');if(!s){s=document.createElement('style');s.id='exp-css';document.head.appendChild(s);}s.textContent=${JSON.stringify(variant)};})()`,
});
await send('DOM.getDocument');
await send('LayerTree.enable');
await new Promise((r) => setTimeout(r, 1500));
await send('Runtime.evaluate', { expression: 'document.body.offsetHeight' });
await new Promise((r) => setTimeout(r, 800));

const layers = lastLayers || [];
const reasonsCount = {};
for (const l of layers.slice(0, 400)) {
  const res = await send('LayerTree.compositingReasons', { layerId: l.layerId });
  const reasons = (res.result && res.result.compositingReasons) || ['?'];
  const key = reasons.join(', ');
  reasonsCount[key] = (reasonsCount[key] || 0) + 1;
}
console.log(`Вариант: ${variant || 'текущий'} — слоёв: ${layers.length}, с отрисовкой: ${layers.filter((l) => l.drawsContent).length}`);
Object.entries(reasonsCount)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));

// LAYERS_SIZES=1 — каждый слой с отрисовкой: размер и элемент (большие слои = память видеочипа)
if (process.env.LAYERS_SIZES) {
  let total = 0;
  for (const l of layers.filter((x) => x.drawsContent)) {
    let who = '';
    if (l.backendNodeId) {
      const r = await send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [l.backendNodeId] });
      const nodeId = r.result && r.result.nodeIds && r.result.nodeIds[0];
      if (nodeId) {
        const a = await send('DOM.getAttributes', { nodeId });
        const attrs = (a.result && a.result.attributes) || [];
        const cls = attrs[attrs.indexOf('class') + 1];
        who = attrs.indexOf('class') !== -1 ? '.' + String(cls).split(' ').join('.') : '';
      }
    }
    total += l.width * l.height;
    console.log(`  ${String(Math.round(l.width)).padStart(5)}×${String(Math.round(l.height)).padEnd(5)} ${who}`);
  }
  console.log(`Площадь слоёв: ${(total / (1920 * 1080)).toFixed(1)} экрана`);
}
await send('LayerTree.disable');
ws.close();
