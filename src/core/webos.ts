/**
 * Вызов системных служб webOS (luna) прямо из приложения — без библиотеки webOSTV.js.
 * Работает только на телевизоре; в браузере ПК сразу возвращает ошибку.
 */

// Мост нужно держать, пока не придёт ответ: иначе сборщик мусора удалит его вместе с ответом
const pending: unknown[] = [];

export function hasWebOS() {
  return typeof (window as any).PalmServiceBridge !== 'undefined';
}

export function luna<T = any>(uri: string, params: object = {}): Promise<T> {
  const Bridge = (window as any).PalmServiceBridge;
  if (!Bridge) return Promise.reject(new Error('Это работает только на телевизоре'));
  return new Promise((resolve, reject) => {
    const bridge = new Bridge();
    pending.push(bridge);
    bridge.onservicecallback = (msg: string) => {
      pending.splice(pending.indexOf(bridge), 1);
      let res: any;
      try {
        res = JSON.parse(msg);
      } catch (e) {
        res = { returnValue: false, errorText: msg };
      }
      if (res.returnValue === false) reject(new Error(res.errorText || 'Ошибка webOS'));
      else resolve(res as T);
    };
    bridge.call(uri, JSON.stringify(params));
  });
}

/** Запустить другое приложение телевизора. */
export function launchApp(id: string, params: object = {}) {
  return luna('luna://com.webos.applicationManager/launch', { id, params });
}
