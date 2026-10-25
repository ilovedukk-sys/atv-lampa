import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Item } from '../data/types';
import { artImage, type ArtVariant } from '../core/artImage';
import { img } from '../api/tmdb';
import { lazyImage } from '../core/lazy';
import { imageSizes } from '../core/quality';

interface Props {
  item: Item;
  variant: ArtVariant;
}

/** Какую картинку TMDB брать для каждого вида карточки; размер — по настройке «Качество обложек». */
export function photoFor(item: Item, variant: ArtVariant): string | undefined {
  const size = imageSizes();
  switch (variant) {
    case 'poster':
      return img(item.poster, size.poster);
    case 'landscape':
    case 'episode':
      return img(item.backdrop, size.landscape);
    case 'person':
      return img(item.poster, size.person);
    case 'hero':
      return img(item.backdrop, size.hero);
    default:
      return undefined;
  }
}

/**
 * Обложка карточки: настоящая картинка TMDB (грузится лениво, когда карточка подъезжает к экрану)
 * или нарисованная заглушка, если картинки нет.
 * Слои .art__bg и .art__logo двигаются при параллаксе в разные стороны.
 */
export function Artwork({ item, variant }: Props) {
  const photo = photoFor(item, variant);

  if (photo) {
    return (
      <div class={`art art--${variant} art--photo`}>
        <LazyBg src={photo} color={item.colors[1]} shade={variant === 'landscape'}>
          {/* Название прямо на кадре, как логотипы на карточках Apple TV */}
          {variant === 'landscape' && <div class="art__title">{item.title}</div>}
        </LazyBg>
      </div>
    );
  }

  const src = artImage(item.id, item.colors, variant);
  return (
    <div class={`art art--${variant}`}>
      <div class="art__bg" style={{ backgroundImage: `url(${src})` }} />
      {variant === 'person' ? (
        <div class="art__logo">{initials(item.title)}</div>
      ) : variant !== 'hero' && variant !== 'episode' ? (
        <div class="art__logo">{item.title}</div>
      ) : null}
    </div>
  );
}

/** Фон обложки, картинка подставляется, когда карточка подъезжает к экрану. */
function LazyBg(props: { src: string; color: string; shade?: boolean; children?: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => lazyImage(ref.current!), [props.src]);
  return (
    <div
      ref={ref}
      class="art__bg"
      data-src={props.src}
      data-shade={props.shade ? SHADE : undefined}
      style={{ backgroundColor: props.color }}
    >
      {props.children}
    </div>
  );
}

// Затемнение снизу под название — тем же фоном, что и картинка (без лишних элементов)
const SHADE = 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.65) 100%)';

/** «Анна Соколова» → «АС» — если у актёра нет фото. */
function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2);
}
