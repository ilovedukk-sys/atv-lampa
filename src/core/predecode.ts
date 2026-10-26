/**
 * Распаковка больших кадров заранее.
 *
 * Браузер ТВ распаковывает JPEG, только когда картинку пора рисовать: кадр 1280×720 — это
 * 100–150 мс работы, и если она совпадает с анимацией (открытие фильма, смена слайда Top Shelf),
 * кадры пропадают. Поэтому заранее рисуем картинку в крошечный (1×1) почти прозрачный слой
 * поверх всего: браузер распаковывает её целиком и держит готовой, а настоящий фон потом
 * рисуется без задержки. Проверено трейсом на ТВ: распаковка при открытии фильма 103 мс → 0.
 *
 * Слой должен быть поверх всего: под непрозрачным экраном браузер его не рисует и не распаковывает.
 * Держим не больше двух картинок (каждая — ~3,7 МБ видеопамяти); в минимальном режиме не держим.
 */
import { isUltra } from './lite';

const MAX = 2;
let box: HTMLDivElement | null = null;

export function predecode(url: string | undefined) {
  if (!url || isUltra()) return;
  if (!box) {
    box = document.createElement('div');
    box.className = 'predecode';
    document.body.appendChild(box);
  }
  const imgs = box.getElementsByTagName('img');
  for (let i = 0; i < imgs.length; i++) {
    if (imgs[i].getAttribute('src') === url) {
      box.appendChild(imgs[i]); // уже есть — делаем самой свежей
      return;
    }
  }
  const pic = document.createElement('img');
  pic.src = url;
  box.appendChild(pic);
  while (box.children.length > MAX) box.removeChild(box.firstChild!);
}
