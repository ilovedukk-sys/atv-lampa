/**
 * Сетка постеров (жанр, медиатека). Каждый ряд — отдельный «раздел» страницы,
 * поэтому при движении вниз страница прокручивается ряд за рядом, как в tvOS.
 */
import type { CardKind, Item } from '../data/types';
import { Card } from './Card';

export const GRID_COLS = 6;

interface Props {
  items: Item[];
  kind?: CardKind;
  onSelect: (item: Item) => void;
  firstIsTop?: boolean; // первый ряд считается «верхом» страницы (без прокрутки)
}

export function Grid({ items, kind = 'poster', onSelect, firstIsTop }: Props) {
  const rows: Item[][] = [];
  for (let i = 0; i < items.length; i += GRID_COLS) rows.push(items.slice(i, i + GRID_COLS));
  return (
    <div class="grid">
      {rows.map((row, r) => (
        <section
          key={r}
          class="grid__row"
          data-section
          data-section-top={firstIsTop && r === 0 ? '' : undefined}
          data-row={r}
        >
          {row.map((item) => (
            <Card key={item.id} item={item} kind={kind} onSelect={onSelect} />
          ))}
        </section>
      ))}
    </div>
  );
}
