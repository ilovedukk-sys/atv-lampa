/**
 * Короткие команды для телевизора:
 *   npm run tv:install  — установить собранный .ipk
 *   npm run tv:launch   — запустить приложение
 *   npm run tv:inspect  — открыть отладчик (DevTools) приложения на ТВ
 * Телевизор должен быть добавлен под именем "tv" (см. TV.md).
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DEVICE = process.env.TV_DEVICE || 'tv';
const info = JSON.parse(readFileSync('public/appinfo.json', 'utf8'));
const ipk = `build/${info.id}_${info.version}_all.ipk`;

const commands = {
  install: ['ares-install', '--device', DEVICE, ipk],
  launch: ['ares-launch', '--device', DEVICE, info.id],
  inspect: ['ares-inspect', '--device', DEVICE, '--app', info.id, '--open'],
};

// Замер плавности: перезапуск приложения с параметром {"bench":1}, через ~25 с — снимок экрана
if (process.argv[2] === 'bench') {
  const ares = (tool, args) =>
    spawnSync(process.execPath, [`node_modules/@webos-tools/cli/bin/${tool}.js`, ...args], { stdio: 'inherit' });
  ares('ares-launch', ['--device', DEVICE, '--close', info.id]);
  // BENCH_PARAMS='{"exp":1}' — опыт с вариантами CSS (см. src/core/bench.ts), BENCH_WAIT — секунд ждать
  const params = { bench: 1, ...JSON.parse(process.env.BENCH_PARAMS || '{}') };
  const seconds = Number(process.env.BENCH_WAIT || 110);
  ares('ares-launch', ['--device', DEVICE, info.id, '-p', JSON.stringify(params)]);
  console.log(`Идёт замер, ~${seconds} секунд…`);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  process.argv[2] = 'screenshot';
}

// Снимок экрана ТВ в screenshots/ (только для ТВ с root: SSH-ключ ~/.ssh/webos_tv)
if (process.argv[2] === 'screenshot') {
  const host = process.env.TV_HOST || '192.168.0.11';
  const ssh = `ssh -i ~/.ssh/webos_tv -o BatchMode=yes root@${host}`;
  const file = `screenshots/tv-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const call = `luna-send -n 1 luna://com.webos.surfacemanager/captureCompositorOutput '{"output":"/tmp/atv.png","format":"PNG"}' >/dev/null`;
  const run = (c) => spawnSync(c, { stdio: 'inherit', shell: 'bash' }).status;
  if (run(`mkdir -p screenshots && ${ssh} -tt "${call.replace(/"/g, '\\"')}; exit" >/dev/null && ${ssh} "cat /tmp/atv.png; rm -f /tmp/atv.png" > ${file}`) !== 0) process.exit(1);
  console.log('Снимок экрана: ' + file);
  process.exit(0);
}

const cmd = commands[process.argv[2]];
if (!cmd) {
  console.error('Использование: node scripts/tv.mjs install|launch|inspect');
  process.exit(1);
}
const r = spawnSync('npx', cmd, { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
