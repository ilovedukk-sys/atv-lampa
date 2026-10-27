/**
 * Разрешение интерфейса на ТВ: 720p (плавнее — видеочипу в 2,25 раза меньше точек) или 1080p (чётче текст).
 *
 * webOS берёт разрешение только из appinfo.json, во время работы его не поменять. Поэтому при установке
 * с компьютера (scripts/tv.mjs) на ТВ кладутся оба варианта приложения, а здесь мы просим Homebrew Channel
 * (он умеет выполнять команды от root) переустановить нужный вариант и снова открыть приложение.
 * Данные (настройки, медиатека, история) при переустановке сохраняются.
 */
import { hasWebOS, luna } from './webos';

export type UiRes = '1280x720' | '1920x1080';

export const UI_RES_LABELS: Record<UiRes, string> = {
  '1280x720': '720p',
  '1920x1080': '1080p',
};

const APP_ID = 'com.atvlampa.app';
const DIR = '/media/developer/atvlampa'; // туда кладёт варианты scripts/tv.mjs
const TMP_IPK = '/tmp/atvlampa-ui.ipk'; // установщик берёт пакет отсюда
const APPINFO = `/media/developer/apps/usr/palm/applications/${APP_ID}/appinfo.json`;

/** Текущее разрешение: окно приложения 1280 точек в ширину — значит, 720p. */
export function uiRes(): UiRes {
  return window.innerWidth <= 1280 ? '1280x720' : '1920x1080';
}

/**
 * Переключить разрешение. Приложение закроется (его переустанавливает система) и через ~5 с откроется
 * само. Команда работает в фоне от Homebrew Channel — ей не мешает то, что наше приложение закрылось.
 */
export function switchUiRes(to: UiRes): Promise<void> {
  if (!hasWebOS()) return Promise.reject(new Error('Это работает только на телевизоре'));
  const ipk = `${DIR}/ui-${to}.ipk`;
  const install = JSON.stringify({ id: APP_ID, ipkUrl: TMP_IPK, subscribe: false });
  const launch = JSON.stringify({ id: APP_ID });
  const script = [
    `[ -f ${ipk} ] || { echo NOFILE; exit 0; }`,
    `cp ${ipk} ${TMP_IPK} || { echo NOCOPY; exit 0; }`,
    '(',
    'sleep 1',
    `luna-send -n 1 luna://com.webos.appInstallService/dev/install '${install}'`,
    // ждём, пока установщик заменит appinfo.json, — не дольше 30 с
    `i=0; while [ $i -lt 30 ] && ! grep -q '"${to}"' ${APPINFO}; do sleep 1; i=$((i+1)); done`,
    'sleep 2',
    `luna-send -n 1 luna://com.webos.applicationManager/launch '${launch}'`,
    `rm -f ${TMP_IPK}`,
    ') >/dev/null 2>&1 &',
    'echo OK',
  ].join('\n');
  return luna<{ stdoutString?: string }>('luna://org.webosbrew.hbchannel.service/exec', { command: script }).then(
    (r) => {
      const out = (r.stdoutString || '').trim();
      if (out === 'NOFILE') throw new Error('Варианта нет на ТВ — переустановите приложение с компьютера');
      if (out !== 'OK') throw new Error('Не удалось переключить разрешение');
    },
    (e: Error) => {
      throw new Error(/not.?found|unknown|denied|permission/i.test(e.message) ? 'Для этого нужен Homebrew Channel' : e.message);
    },
  );
}
