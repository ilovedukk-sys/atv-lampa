/**
 * Боковая панель, как в приложении Apple TV (tvOS 18+): стеклянная плашка слева
 * с профилем, часами и разделами. Выезжает поверх контента, когда нажимают влево
 * с крайнего элемента или «Назад»; прячется, когда фокус уходит вправо в контент.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { focusedClass, getFocused, onFocusChange, screenOf } from '../core/focus';
import { FilmIcon, GearIcon, HomeIcon, KidsIcon, LibraryIcon, ProfileIcon, SearchIcon, TvIcon } from './Icons';
import { avatarColor, initials, profileName, useProfile } from '../core/profile';

export const TABS: { id: string; label: string; Icon: () => JSX.Element }[] = [
  { id: 'search', label: 'Поиск', Icon: SearchIcon },
  { id: 'home', label: 'Главная', Icon: HomeIcon },
  { id: 'movies', label: 'Фильмы', Icon: FilmIcon },
  { id: 'shows', label: 'Сериалы', Icon: TvIcon },
  { id: 'kids', label: 'Детям', Icon: KidsIcon },
  { id: 'library', label: 'Медиатека', Icon: LibraryIcon },
  { id: 'settings', label: 'Настройки', Icon: GearIcon },
];

// Как в tvOS: раздел открывается, если на нём задержаться (или сразу по «ОК»)
const SWITCH_DELAY_MS = 400;

interface Props {
  active: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ active, onSelect }: Props) {
  const ref = useRef<HTMLElement>(null);
  useProfile(); // имя и аватар меняются в «Настройках»

  // Фокус в панели — панель открыта (класс на экране), ушёл — спрятана
  useEffect(
    () =>
      onFocusChange((el) => {
        const screen = ref.current && screenOf(ref.current);
        if (!screen) return;
        const open = !!el.closest('[data-sidebar]');
        if (screen.classList.contains('sidebar-open') !== open) screen.classList.toggle('sidebar-open', open);
      }),
    [],
  );

  return (
    <nav ref={ref} class="sidebar glass" data-sidebar data-focus-group data-focus-remember>
      <div class="sidebar__profile">
        <Avatar />
        <span class="sidebar__name">{profileName() || 'Профиль'}</span>
        <Clock />
      </div>
      {TABS.map((t) => (
        <Item key={t.id} id={t.id} label={t.label} Icon={t.Icon} active={t.id === active} onSelect={onSelect} />
      ))}
    </nav>
  );
}

function Item(props: { id: string; label: string; Icon: () => JSX.Element; active: boolean; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const select = useRef(props.onSelect);
  select.current = props.onSelect;

  useEffect(() => {
    const el = ref.current!;
    let timer = 0;
    const onFocus = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (getFocused() === el) select.current(props.id);
      }, SWITCH_DELAY_MS);
    };
    el.addEventListener('tvfocus', onFocus);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('tvfocus', onFocus);
    };
  }, []);

  const { Icon } = props;
  return (
    <button
      ref={ref}
      class={`sidebar__item${props.active ? ' is-active' : ''}${focusedClass(ref.current)}`}
      data-focusable
      onClick={() => props.onSelect(props.id)}
    >
      <Icon />
      <span>{props.label}</span>
    </button>
  );
}

/** Аватар профиля: инициалы на цветном кружке, без имени — значок. Так же — в «Настройках». */
export function Avatar() {
  const c = avatarColor();
  const letters = initials();
  return (
    <span class="sidebar__avatar" style={{ background: `linear-gradient(160deg, ${c.from}, ${c.to})` }}>
      {letters ? <b>{letters}</b> : <ProfileIcon />}
    </span>
  );
}

/** Часы в панели. Обновляются раз в 20 секунд — перерисовка только при смене минуты. */
function Clock() {
  const now = () => {
    const d = new Date();
    return `${d.getHours()}:${('0' + d.getMinutes()).slice(-2)}`;
  };
  const [time, setTime] = useState(now);
  useEffect(() => {
    const t = setInterval(() => setTime(now()), 20000);
    return () => clearInterval(t);
  }, []);
  return <span class="sidebar__time">{time}</span>;
}
