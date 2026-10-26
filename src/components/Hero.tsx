import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../data/types';
import { artImage } from '../core/artImage';
import { img } from '../api/tmdb';
import { photoFor } from './Artwork';
import { imageSizes } from '../core/quality';
import { isUltra } from '../core/lite';
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
 * Полноэкранная картинка фона (Top Shelf, экран фильма): кадр с затемнением под текст.
 * fade — цвет, в который кадр переходит внизу (фон под полками на главной, как в tvOS 26).
 */
export function BackdropImage({ item, fade }: { item: Item; fade?: string }) {
  const photo = photoFor(item, 'hero');
  const fallback = photo ? '' : artImage(item.id, item.colors, 'hero');
  return (
    <div class="backdrop__sharp">
      <img class="backdrop__img" src={photo || fallback} alt="" />
      {photo && <div class="backdrop__shade" style={fade ? { background: shadeInto(fade) } : undefined} />}
    </div>
  );
}

/**
 * Затемнение слева под текст и сверху под панель, внизу — переход в цвет фона страницы.
 * Переход в цвет — верхний слой: иначе затемнение слева легло бы поверх и на стыке с фоном была бы граница.
 */
function shadeInto(color: string) {
  return (
    `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 55%, ${color} 100%),` +
    'linear-gradient(90deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0) 70%),' +
    'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 22%)'
  );
}

/**
 * Фон «Top Shelf». Лежит под страницей и не прокручивается.
 * Держим на экране максимум два слайда: новый плавно проявляется поверх старого,
 * потом старый удаляется — слабому ТВ не приходится хранить все фоны сразу.
 */
export function HeroBackdrop({ items, index, tint }: { items: Item[]; index: number; tint?: string }) {
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
    if (isUltra()) return; // минимальный режим: не держим в памяти фоны всех слайдов
    items.forEach((it) => {
      const pic = new Image();
      pic.src = photoFor(it, 'hero') || artImage(it.id, it.colors, 'hero');
    });
  }, [items]);

  if (!items.length) return null;
  const visible = prev === null || !items[prev] ? [index] : [prev, index];

  return (
    <div class="backdrop" data-scroll-follow>
      {visible.map((i) => (
        <div key={items[i].id} class={`backdrop__slide${i === index && prev !== null ? ' is-entering' : ''}`}>
          <BackdropImage item={items[i]} fade={tint} />
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
          <div class="hero__meta">{kindLabel(item)}</div>
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

/** «Сериал · Криминал · 2021», «Фильм · Ужасы · 2026», «Мультсериал · 2023» — сразу видно, что это. */
function kindLabel(item: Item) {
  if (!item.kind || /^Мульт/.test(item.meta)) return item.meta; // «Мультфильм», «Мультсериал» — и так понятно
  return [item.kind === 'show' ? 'Сериал' : 'Фильм', item.meta].filter(Boolean).join(' · ');
}
