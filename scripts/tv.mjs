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

const ares = (tool, args, quiet) =>
  spawnSync(process.execPath, [`node_modules/@webos-tools/cli/bin/${tool}.js`, ...args], {
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const running = () => (ares('ares-launch', ['--device', DEVICE, '--running'], true).stdout || '').indexOf(info.id) !== -1;

/*
 * Запуск с проверкой. Закрытие (и переустановка) на ТВ заканчивается не сразу, и запуск, пришедший
 * в это время, однажды потерялся: приложение не открылось, а на экран вернулось предыдущее
 * (IPTV пользователя). Поэтому ждём настоящего закрытия, а запуск проверяем и при неудаче повторяем.
 */
async function launchChecked(params, afterClose) {
  if (afterClose) for (let i = 0; i < 10 && running(); i++) await sleep(1000);
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(3000);
    const args = ['--device', DEVICE, info.id].concat(params ? ['-p', JSON.stringify(params)] : []);
    if (ares('ares-launch', args).status === 0 && running()) return true;
  }
  console.error('Приложение не запустилось. Проверьте, что сейчас на экране ТВ.');
  return false;
}

const commands = {
  install: ['ares-install', '--device', DEVICE, ipk],
  inspect: ['ares-inspect', '--device', DEVICE, '--app', info.id, '--open'],
};

if (process.argv[2] === 'launch') process.exit((await launchChecked()) ? 0 : 1);

// Замер плавности: перезапуск приложения с параметром {"bench":1}, через ~170 с — снимок экрана
if (process.argv[2] === 'bench') {
  ares('ares-launch', ['--device', DEVICE, '--close', info.id]);
  // BENCH_PARAMS='{"exp":1}' — опыт с вариантами CSS (см. src/core/bench.ts), BENCH_WAIT — секунд ждать
  const params = { bench: 1, ...JSON.parse(process.env.BENCH_PARAMS || '{}') };
  const seconds = Number(process.env.BENCH_WAIT || 170); // три режима ≈ 2,5 минуты
  if (!(await launchChecked(params, true))) process.exit(1);
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
