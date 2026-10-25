/**
 * Временные данные: используются, если не задан ключ TMDB (см. .env.example)
 * или TMDB недоступен.
 */

import type { Item, Shelf } from './types';
export type { CardKind, Item, Shelf } from './types';

export const heroItems: Item[] = [
  {
    id: 'dune',
    title: 'Дюна: Часть вторая',
    meta: 'Фантастика · 2024 · 2 ч 46 мин',
    description:
      'Пол Атрейдес объединяется с фрименами, чтобы отомстить заговорщикам, уничтожившим его семью.',
    colors: ['#c2733a', '#2a1406'],
  },
  {
    id: 'severance',
    title: 'Разделение',
    kind: 'show',
    meta: 'Сериал · Триллер · 2 сезона',
    description:
      'Сотрудники корпорации разделяют воспоминания о работе и личной жизни. Но однажды правда начинает просачиваться.',
    colors: ['#3d7ea6', '#081622'],
  },
  {
    id: 'interstellar',
    title: 'Интерстеллар',
    meta: 'Фантастика · 2014 · 2 ч 49 мин',
    description:
      'Группа исследователей отправляется сквозь червоточину в поисках нового дома для человечества.',
    colors: ['#5b5f6b', '#06070a'],
  },
];

const c = (a: string, b: string): [string, string] => [a, b];

export const shelves: Shelf[] = [
  {
    id: 'continue',
    title: 'Продолжить просмотр',
    kind: 'landscape',
    items: [
      { id: 'c1', title: 'Разделение', meta: 'Сериал', episode: 'С2, Э4 · осталось 21 мин', progress: 0.55, colors: c('#3d7ea6', '#0b1d2c') },
      { id: 'c2', title: 'Медведь', meta: 'Сериал', episode: 'С3, Э2 · осталось 9 мин', progress: 0.8, colors: c('#b0412f', '#1d0b07') },
      { id: 'c3', title: 'Оппенгеймер', meta: 'Фильм', episode: 'осталось 1 ч 12 мин', progress: 0.38, colors: c('#d08b3a', '#2a1203') },
      { id: 'c4', title: 'Тед Лассо', meta: 'Сериал', episode: 'С1, Э7 · осталось 18 мин', progress: 0.3, colors: c('#2f7d4f', '#08190f') },
      { id: 'c5', title: 'Основание', meta: 'Сериал', episode: 'С2, Э1 · осталось 40 мин', progress: 0.12, colors: c('#6e4fb3', '#120a24') },
      { id: 'c6', title: 'Слау Хаус', meta: 'Сериал', episode: 'С4, Э3 · осталось 30 мин', progress: 0.45, colors: c('#7a7f3a', '#16170a') },
    ],
  },
  {
    id: 'top',
    title: 'Популярные фильмы',
    kind: 'poster',
    items: [
      { id: 'p1', title: 'Дюна', meta: '2021', colors: c('#c2733a', '#2a1406') },
      { id: 'p2', title: 'Интерстеллар', meta: '2014', colors: c('#5b5f6b', '#06070a') },
      { id: 'p3', title: 'Бегущий по лезвию 2049', meta: '2017', colors: c('#e0702c', '#1d0f2e') },
      { id: 'p4', title: 'Начало', meta: '2010', colors: c('#3b5c7d', '#0a0f17') },
      { id: 'p5', title: 'Марсианин', meta: '2015', colors: c('#c4552e', '#250b05') },
      { id: 'p6', title: 'Прибытие', meta: '2016', colors: c('#6f8a8c', '#0c1414') },
      { id: 'p7', title: 'Гравитация', meta: '2013', colors: c('#2e3f66', '#04060d') },
      { id: 'p8', title: 'Матрица', meta: '1999', colors: c('#2f8f4e', '#020a04') },
      { id: 'p9', title: 'Тёмный рыцарь', meta: '2008', colors: c('#3a4a5c', '#050608') },
      { id: 'p10', title: 'Джокер', meta: '2019', colors: c('#c24a3a', '#1a0d0a') },
    ],
  },
  {
    id: 'shows',
    title: 'Новые сериалы',
    kind: 'landscape',
    items: [
      { id: 's1', title: 'Сёгун', meta: 'Драма · 2024', colors: c('#8c2d24', '#120504') },
      { id: 's2', title: 'Fallout', meta: 'Фантастика · 2024', colors: c('#d1a33b', '#1c1405') },
      { id: 's3', title: 'Задача трёх тел', meta: 'Фантастика · 2024', colors: c('#2c6c8f', '#030c12') },
      { id: 's4', title: 'Пингвин', meta: 'Криминал · 2024', colors: c('#4f5a6b', '#07090c') },
      { id: 's5', title: 'Одни из нас', meta: 'Драма · 2023', colors: c('#5c7a3d', '#0b1206') },
      { id: 's6', title: 'Настоящий детектив', meta: 'Детектив · 2024', colors: c('#456b8f', '#060b10') },
    ],
  },
  {
    id: 'genres',
    title: 'Жанры',
    kind: 'genre',
    items: [
      { id: 'g1', title: 'Фантастика', meta: '', colors: c('#4b39b5', '#1b0f4a') },
      { id: 'g2', title: 'Драма', meta: '', colors: c('#b5394f', '#4a0f1c') },
      { id: 'g3', title: 'Комедия', meta: '', colors: c('#e0a12c', '#7a4a06') },
      { id: 'g4', title: 'Триллер', meta: '', colors: c('#2c3e50', '#0a1016') },
      { id: 'g5', title: 'Анимация', meta: '', colors: c('#2cb5a0', '#0a4a40') },
      { id: 'g6', title: 'Документальные', meta: '', colors: c('#7a8a3a', '#2a300c') },
      { id: 'g7', title: 'Ужасы', meta: '', colors: c('#5a1414', '#120303') },
    ],
  },
];

// Сериалы помечаем явно — для них экран фильма показывает сезоны и серии
shelves.forEach((shelf) =>
  shelf.items.forEach((item) => {
    if (shelf.id === 'shows' || item.meta === 'Сериал') item.kind = 'show';
  }),
);
