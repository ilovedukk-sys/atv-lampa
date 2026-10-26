/**
 * Страница актёра (режиссёра), как в Apple TV: круглое фото, имя, кто он и биография
 * (по «ОК» — целиком), ниже полки: известные работы, режиссёр, фильмы, сериалы.
 *
 * Шапка появляется сразу — имя и фото известны из карточки; полки — когда ответит TMDB.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item, Shelf } from '../data/types';
import { loadPerson, type Person } from '../api/person';
import { img } from '../api/tmdb';
import { focus, focusFirstIn, pushBackHandler } from '../core/focus';
import { tintOf } from '../core/color';
import { isUltra } from '../core/lite';
import { ShelfRow } from './ShelfRow';
import { Overlay } from './Overlay';
import { Spinner, Message } from './Spinner';

interface Props {
  person: Item; // карточка из «Актёры и съёмочная группа»: id 'person:6384'
  active: boolean;
  onOpen: (item: Item) => void;
  onClose: () => void;
}

const DEFAULT_TINT = '#1f2229';
// Первая полка встаёт так, чтобы шапка с фото оставалась на экране
const FIRST_SHELF_STICK = 600;

export function PersonScreen({ person, active, onOpen, onClose }: Props) {
  const [p, setP] = useState<Person | null>(null);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const [tint, setTint] = useState(DEFAULT_TINT);
  const root = useRef<HTMLDivElement>(null);
  const bioRef = useRef<HTMLDivElement>(null);
  const photo = img(p ? p.photo : person.poster, isUltra() ? 'w185' : 'w300');

  useEffect(() => {
    let alive = true;
    loadPerson(person)
      .then((x) => alive && x && setP(x))
      .catch(() => alive && setError(true));
    // Фон — спокойный цвет из фото, как полки на главной
    tintOf(img(person.poster, 'w45'), DEFAULT_TINT).then((c) => alive && setTint(c));
    return () => {
      alive = false;
    };
  }, []);

  // Пока грузится — фокус на биографии (пусть и пустой), потом — на первую карточку; вверх — биография
  useEffect(() => {
    const r = root.current!;
    const shelf = r.querySelector('.shelf__track') as HTMLElement | null;
    if (shelf) focusFirstIn(shelf);
    else if (bioRef.current) focus(bioRef.current);
  }, [p]);

  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => (more ? setMore(false) : onClose()));
  }, [active, more]);

  // Окно биографии: фокус внутрь, после закрытия — обратно на биографию
  const opened = useRef(false);
  useEffect(() => {
    if (more) {
      opened.current = true;
      focusFirstIn(root.current!.querySelector('.overlay') as HTMLElement);
    } else if (opened.current && bioRef.current) {
      focus(bioRef.current);
    }
  }, [more]);

  const shelves: Shelf[] = p
    ? ([
        { id: 'known', title: 'Известность', items: p.known, kind: 'landscape' },
        { id: 'directed', title: 'Режиссёр', items: p.directed, kind: 'poster' },
        { id: 'movies', title: 'Фильмы', items: p.movies, kind: 'poster' },
        { id: 'shows', title: 'Сериалы', items: p.shows, kind: 'poster' },
      ] as Shelf[]).filter((s) => s.items.length > 0)
    : [];
  const bio = p ? p.bio : '';

  return (
    <div ref={root} class={`screen person${active ? '' : ' is-hidden'}`} style={{ background: tint }} data-screen>
      <div class="page" data-scroll-y>
        <section class="person__head" data-section data-section-top>
          <div class="person__photo" style={{ backgroundImage: photo ? `url(${photo})` : undefined }}>
            {!photo && <span>{initials(person.title)}</span>}
          </div>
          <div class="person__text">
            <h1 class="person__name">{p ? p.name : person.title}</h1>
            <div class="person__sub">
              {p ? [p.profession, p.originalName].filter(Boolean).join(' · ') : '…'}
            </div>
            {p && p.facts.length > 0 && <div class="person__facts">{p.facts.join(' · ')}</div>}
            {/* Биография фокусируется всегда — иначе, пока всё грузится, фокусу некуда встать */}
            <div
              ref={bioRef}
              class={`details__desc person__bio${bio ? '' : ' is-empty'}`}
              data-focusable
              onClick={() => bio && setMore(true)}
            >
              <p>{bio || (p ? 'Биографии пока нет.' : '')}</p>
              {bio && <div class="details__more">ЕЩЁ</div>}
            </div>
          </div>
        </section>

        {shelves.map((s, i) => (
          <ShelfRow
            key={s.id}
            shelf={s}
            onSelect={onOpen}
            stick={i === 0 ? FIRST_SHELF_STICK : undefined}
          />
        ))}
        <div class="page__end" />
      </div>

      {!p && !error && (
        <div class="person__loading">
          <Spinner />
        </div>
      )}
      {error && !p && (
        <div class="person__loading">
          <Message title="Нет связи с TMDB" text="Нажмите «Назад» и попробуйте ещё раз." />
        </div>
      )}

      {more && p && (
        <Overlay onClose={() => setMore(false)}>
          <h2>{p.name}</h2>
          <p class="overlay__long">{p.bio}</p>
        </Overlay>
      )}
    </div>
  );
}

/** «Keanu Reeves» → «KR» — если фото нет. */
function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2);
}
