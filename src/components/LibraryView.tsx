/** Вкладка «Медиатека»: всё, что добавлено кнопкой «+». */
import type { Item } from '../data/types';
import { libraryItems, useLibraryVersion } from '../core/library';
import { Grid } from './Grid';
import { Message } from './Spinner';

export function LibraryView({ onOpen }: { onOpen: (item: Item) => void }) {
  useLibraryVersion();
  const items = libraryItems();
  return (
    <div class="page" data-scroll-y>
      <div class="tabpage__head">
        <h1>Медиатека</h1>
        <div class="tabpage__sub">{items.length ? `${items.length} в медиатеке` : ''}</div>
      </div>
      {items.length ? (
        <Grid items={items} onSelect={onOpen} firstIsTop />
      ) : (
        <Message
          title="Пока пусто"
          text="Нажмите «+» на Top Shelf или на экране фильма — он появится здесь."
        />
      )}
      <div class="page__end" />
    </div>
  );
}
