/**
 * Экран жанра: сетка постеров, следующие страницы подгружаются,
 * когда фокус подходит к нижним рядам.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../data/types';
import { listPage } from '../api/tmdb';
import { focusFirstIn, onFocusChange, pushBackHandler } from '../core/focus';
import { Grid } from './Grid';
import { Message, Spinner } from './Spinner';

interface Props {
  genre: Item; // плитка жанра: id 'genre:movie:28'
  active: boolean;
  onOpen: (item: Item) => void;
  onClose: () => void;
}

export function GenreScreen({ genre, active, onOpen, onClose }: Props) {
  const type: 'movie' | 'tv' = genre.kind === 'show' ? 'tv' : 'movie';
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const paging = useRef({ page: 0, total: 1, busy: false });

  const loadMore = () => {
    const p = paging.current;
    if (p.busy || p.page >= p.total) return;
    p.busy = true;
    listPage(`/discover/${type}`, { with_genres: genre.genreId || 0, sort_by: 'popularity.desc', page: p.page + 1 }, type)
      .then((res) => {
        p.page++;
        p.total = Math.min(res.totalPages, 20);
        p.busy = false;
        const fresh = res.items.filter((i) => i.poster);
        setItems((old) => (old || []).concat(fresh));
      })
      .catch(() => {
        p.busy = false;
        setError(true);
      });
  };

  useEffect(loadMore, []);

  // Первые постеры пришли — фокус на первый
  useEffect(() => {
    if (items && items.length && paging.current.page === 1) focusFirstIn(root.current!.querySelector('.grid') as HTMLElement);
  }, [items && items.length > 0]);

  // Фокус в последних двух рядах — грузим ещё
  useEffect(() => {
    if (!active) return;
    return onFocusChange((el) => {
      const row = el.closest('.grid__row') as HTMLElement | null;
      if (!row || !root.current || !root.current.contains(row)) return;
      const total = root.current.querySelectorAll('.grid__row').length;
      if (Number(row.getAttribute('data-row')) >= total - 2) loadMore();
    });
  }, [active]);

  useEffect(() => {
    if (!active) return;
    return pushBackHandler(onClose);
  }, [active]);

  return (
    <div ref={root} class={`screen genre${active ? '' : ' is-hidden'}`} data-screen>
      <div class="page" data-scroll-y>
        <div class="genre__head">
          <h1>{genre.title}</h1>
          <div class="genre__sub">{type === 'tv' ? 'Сериалы' : 'Фильмы'}</div>
        </div>
        {items && <Grid items={items} onSelect={onOpen} firstIsTop />}
        <div class="page__end" />
      </div>
      {!items && !error && <Spinner />}
      {error && !items && <Message title="Нет связи с TMDB" text="Нажмите «Назад» и попробуйте ещё раз." />}
    </div>
  );
}
