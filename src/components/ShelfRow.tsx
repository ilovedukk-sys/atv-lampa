import type { Item, Shelf } from '../data/mock';
import { Card } from './Card';

interface Props {
  shelf: Shelf;
  onSelect: (item: Item) => void;
  stick?: number; // на какой высоте экрана встаёт полка при прокрутке (по умолчанию 150)
}

export function ShelfRow({ shelf, onSelect, stick }: Props) {
  return (
    <section class={`shelf shelf--${shelf.kind}`} data-section data-stick={stick}>
      <h2 class="shelf__title">{shelf.title}</h2>
      <div class="shelf__viewport">
        <div class="shelf__track" data-scroll-x>
          {shelf.items.map((item) => (
            <Card key={item.id} item={item} kind={shelf.kind} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </section>
  );
}
