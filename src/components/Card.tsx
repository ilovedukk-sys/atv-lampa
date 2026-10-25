import { useEffect, useRef } from 'preact/hooks';
import type { CardKind, Item } from '../data/mock';
import { attachParallax } from '../core/parallax';
import { registerCard } from '../core/prefetch';
import { Artwork } from './Artwork';

interface Props {
  item: Item;
  kind: CardKind;
  onSelect: (item: Item) => void;
}

export function Card({ item, kind, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => (ref.current ? attachParallax(ref.current) : undefined), []);
  // Задержатся на карточке — экран фильма подготовится заранее (core/prefetch)
  useEffect(() => {
    if (ref.current) registerCard(ref.current, item);
  }, [item]);

  return (
    <div ref={ref} class={`card card--${kind}`} data-focusable onClick={() => onSelect(item)}>
      <div class="card__tilt">
        <div class="card__frame">
          <Artwork item={item} variant={kind} />
          {item.progress !== undefined && (
            <div class="card__progress">
              <i style={{ width: `${Math.round(item.progress * 100)}%` }} />
            </div>
          )}
          <div class="card__shine" />
        </div>
      </div>
      {kind !== 'genre' && (
        <div class="card__caption">
          <div class="card__title">{item.title}</div>
          <div class="card__sub">{item.episode || item.meta}</div>
          {kind === 'episode' && item.description && <div class="card__text">{item.description}</div>}
        </div>
      )}
    </div>
  );
}
