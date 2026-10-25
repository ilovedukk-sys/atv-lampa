import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../data/types';
import { artImage } from '../core/artImage';
import { img } from '../api/tmdb';
import { photoFor } from './Artwork';
import { imageSizes } from '../core/quality';
import { LibraryButton, PlayButton, RoundButton } from './Buttons';
import { ChevronRightIcon, InfoIcon } from './Icons';

const FADE_MS = 1200;

/** Сколько показывается слайд Top Shelf до смены. */
export const HERO_INTERVAL = 8000;

/**
 * Полоска прогресса активного слайда. Обновляется 5 раз в секунду, а не каждый кадр:
 * полоска узкая и движется медленно — на глаз так же плавно, а непрерывная CSS-анимация
 * заставляла ТВ перерисовывать экран 60 раз в секунду даже в покое.
 */
function ProgressFill() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / HERO_INTERVAL);
      if (ref.current) ref.current.style.transform = `scaleX(${p.toFixed(3)})`;
      if (p >= 1) clearInterval(t);
    }, 200);
    return () => clearInterval(t);
  }, []);
  return <b ref={ref} />;
}

/**
 * Полноэкранная картинка фона (Top Shelf, экран фильма): чёткий кадр с затемнением
 * и «размытый» вариант для прокрутки (см. .backdrop__sharp / .backdrop__soft в app.css).
 */
export function BackdropImage({ item }: { item: Item }) {
  const photo = photoFor(item, 'hero');
  const fallback = photo ? '' : artImage(item.id, item.colors, 'hero');
  // Маленький кадр (300 px), растянутый на экран, — дешёвая замена размытию
  const soft = img(item.backdrop, 'w300') || fallback;
  return (
    <>
      <div class="backdrop__sharp">
        <img class="backdrop__img" src={photo || fallback} alt="" />
        {photo && <div class="backdrop__shade" />}
      </div>
      <img class="backdrop__soft" src={soft} alt="" />
    </>
  );
}

/**
 * Фон «Top Shelf». Лежит под страницей и не прокручивается.
 * Держим на экране максимум два слайда: новый плавно проявляется поверх старого,
 * потом старый удаляется — слабому ТВ не приходится хранить все фоны сразу.
 */
export function HeroBackdrop({ items, index }: { items: Item[]; index: number }) {
  const [prev, setPrev] = useState<number | null>(null);
  const shown = useRef(index);

  useEffect(() => {
    if (index === shown.current) return;
    setPrev(shown.current);
    shown.current = index;
    const t = setTimeout(() => setPrev(null), FADE_MS + 100);
    return () => clearTimeout(t);
  }, [index]);

  // Заранее загружаем все фоны, чтобы смена слайда не ждала сеть
  useEffect(() => {
    items.forEach((it) => {
      const pic = new Image();
      pic.src = photoFor(it, 'hero') || artImage(it.id, it.colors, 'hero');
    });
  }, [items]);

  if (!items.length) return null;
  const visible = prev === null || !items[prev] ? [index] : [prev, index];

  return (
    <div class="backdrop">
      {visible.map((i) => (
        <div key={items[i].id} class={`backdrop__slide${i === index && prev !== null ? ' is-entering' : ''}`}>
          <BackdropImage item={items[i]} />
        </div>
      ))}
    </div>
  );
}

/** Название: логотип-картинка из TMDB, если есть, иначе крупный текст. */
export function TitleLogo({ item, logo, cls }: { item: Item; logo?: string; cls: string }) {
  const src = img(logo, imageSizes().logo);
  return src ? <img class={`${cls}img`} src={src} alt={item.title} /> : <h1 class={cls}>{item.title}</h1>;
}

interface HeroProps {
  items: Item[];
  index: number;
  onPlay: (item: Item) => void;
  onInfo: (item: Item) => void;
  onNext: () => void;
  notify: (text: string) => void;
}

/** Текст и кнопки поверх фона. */
export function Hero({ items, index, onPlay, onInfo, onNext, notify }: HeroProps) {
  const item = items[index];
  if (!item) return null;
  return (
    <section class="hero" data-section data-section-top data-hero>
      <div class="hero__info">
        {/* key заставляет текст перерисоваться с анимацией; кнопки не трогаем, чтобы не терять фокус */}
        <div class="hero__text" key={item.id}>
          <TitleLogo item={item} logo={item.logo} cls="hero__logo" />
          <div class="hero__meta">{item.meta}</div>
          <p class="hero__desc">{item.description}</p>
        </div>
        <div class="hero__buttons">
          <PlayButton label="Воспроизвести" onClick={() => onPlay(item)} />
          <LibraryButton
            item={item}
            onChange={(added) => notify(added ? `«${item.title}» в медиатеке` : `«${item.title}» убран из медиатеки`)}
          />
          <RoundButton label="Подробнее" onClick={() => onInfo(item)}>
            <InfoIcon />
          </RoundButton>
          {items.length > 1 && (
            <RoundButton label="Следующий" onClick={onNext}>
              <ChevronRightIcon />
            </RoundButton>
          )}
        </div>
      </div>
      <div class="hero__dots">
        {items.map((it, i) => (
          <i key={it.id} class={i === index ? 'is-active' : ''}>
            {i === index && <ProgressFill key={index} />}
          </i>
        ))}
      </div>
    </section>
  );
}
