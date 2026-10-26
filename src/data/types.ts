/** Общие типы данных: фильм/сериал/серия/актёр — всё это «Item», полка — «Shelf». */

export interface Item {
  id: string; // 'movie:123', 'tv:456', или id временных данных
  title: string;
  originalTitle?: string; // название в оригинале — для поиска раздач
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
  image?: string; // готовый адрес картинки не из TMDB (кадр трейлера с YouTube)
  year?: number;
  rating?: number;
  genreId?: number; // для плиток жанров
  genreIds?: number[]; // жанры TMDB — чтобы разводить мультфильмы и детское по вкладкам
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

/** Файл внутри раздачи TorrServer. */
export interface TorrentFile {
  id: number;
  path: string;
  length: number;
}

/** Что запустить в плеере: файл раздачи (и соседние файлы — для следующей серии и субтитров). */
export interface PlayRequest {
  item: Item; // фильм или сериал
  hash: string;
  link: string;
  files: TorrentFile[]; // видеофайлы раздачи по порядку
  index: number; // какой из них играть
  subs: TorrentFile[]; // субтитры .srt из той же раздачи
}
