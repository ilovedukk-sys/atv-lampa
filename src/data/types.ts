/** Общие типы данных: фильм/сериал/серия/актёр — всё это «Item», полка — «Shelf». */

export interface Item {
  id: string; // 'movie:123', 'tv:456', или id временных данных
  title: string;
  kind?: 'movie' | 'show';
  meta: string; // строка под названием: «Драма · 2024»
  description?: string;
  colors: [string, string]; // цвета заглушки (пока картинка грузится или если её нет)
  progress?: number; // 0..1 для «Продолжить просмотр»
  episode?: string;

  // Данные TMDB (пути картинок без адреса сервера, например '/abc.jpg')
  tmdbId?: number;
  poster?: string; // постер; у актёра — фото
  backdrop?: string; // кадр 16:9; у серии — кадр из серии
  logo?: string; // логотип-название (прозрачный PNG), как в Apple TV
  year?: number;
  rating?: number;
  genreId?: number; // для плиток жанров
}

/** Вид карточки: широкая 16:9, постер 2:3, жанр, серия сериала, актёр (круглая). */
export type CardKind = 'landscape' | 'poster' | 'genre' | 'episode' | 'person';

export interface Shelf {
  id: string;
  title: string;
  kind: CardKind;
  items: Item[];
}

/** Содержимое вкладки: Top Shelf + полки. */
export interface Page {
  hero: Item[];
  shelves: Shelf[];
}
