/**
 * Короткие команды для телевизора:
 *   npm run tv:package  — собрать .ipk (два варианта: интерфейс 720p и 1080p)
 *   npm run tv:install  — установить .ipk (в том разрешении, что сейчас выбрано на ТВ)
 *   npm run tv:launch   — запустить приложение
 *   npm run tv:inspect  — открыть отладчик (DevTools) приложения на ТВ
 * Телевизор должен быть добавлен под именем "tv" (см. TV.md).
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DEVICE = process.env.TV_DEVICE || 'tv';
const HOST = process.env.TV_HOST || '192.168.0.11';
const info = JSON.parse(readFileSync('public/appinfo.json', 'utf8'));

/*
 * Разрешение интерфейса задаётся только в appinfo.json и меняется лишь переустановкой. Поэтому
 * собираем оба варианта и кладём их на ТВ в TV_DIR: пункт «Разрешение интерфейса» в «Настройках»
 * переустанавливает приложение нужным вариантом сам (через Homebrew Channel, см. src/core/resolution.ts).
 */
const RESOLUTIONS = ['1280x720', '1920x1080'];
const TV_DIR = '/media/developer/atvlampa';
const variantIpk = (res) => `build/ui-${res}/${info.id}_${info.version}_all.ipk`;
// SSH через bash — тот же ssh и known_hosts, что у снимка экрана ниже
const ssh = (command, input) =>
  spawnSync('bash', ['-c', `ssh -i ~/.ssh/webos_tv -o BatchMode=yes -o ConnectTimeout=5 root@${HOST} '${command.replace(/'/g, "'\\''")}'`], {
    input,
    encoding: input ? undefined : 'utf8',
  });

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
  inspect: ['ares-inspect', '--device', DEVICE, '--app', info.id, '--open'],
};

if (process.argv[2] === 'launch') process.exit((await launchChecked()) ? 0 : 1);

if (process.argv[2] === 'package') {
  for (const res of RESOLUTIONS) {
    const dir = `build/app-${res}`;
    rmSync(dir, { recursive: true, force: true });
    cpSync('dist', dir, { recursive: true });
    writeFileSync(`${dir}/appinfo.json`, JSON.stringify({ ...info, resolution: res }, null, 2));
    if (ares('ares-package', [dir, '-o', `build/ui-${res}`]).status !== 0) process.exit(1);
  }
  process.exit(0);
}

if (process.argv[2] === 'install') {
  // Ставим в том разрешении, что пользователь выбрал на ТВ (иначе переустановка с ПК сбрасывала бы выбор)
  const current = ((ssh(`grep -o '"resolution": *"[0-9x]*"' /media/developer/apps/usr/palm/applications/${info.id}/appinfo.json`).stdout || '').match(/\d+x\d+/) || [])[0];
  const res = process.env.TV_UI_RES || (current && RESOLUTIONS.indexOf(current) !== -1 ? current : info.resolution);
  if (!existsSync(variantIpk(res))) {
    console.error('Сначала соберите пакеты: npm run tv:package');
    process.exit(1);
  }
  console.log(`Интерфейс: ${res}`);
  if (ares('ares-install', ['--device', DEVICE, variantIpk(res)]).status !== 0) process.exit(1);
  // Оба варианта — на ТВ, для переключения из «Настроек»
  ssh(`mkdir -p ${TV_DIR}`);
  for (const r of RESOLUTIONS) {
    if (ssh(`cat > ${TV_DIR}/ui-${r}.ipk`, readFileSync(variantIpk(r))).status !== 0) {
      console.error('Не удалось скопировать варианты на ТВ (нужен SSH) — переключение разрешения в «Настройках» не заработает.');
    }
  }
  process.exit(0);
}

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
  console.error('Использование: node scripts/tv.mjs package|install|launch|inspect|bench|screenshot');
  process.exit(1);
}
const r = spawnSync('npx', cmd, { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
