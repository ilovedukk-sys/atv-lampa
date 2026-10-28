/**
 * Профиль: имя и цвет аватара, как у профиля в tvOS (аватар — кружок с инициалами).
 * Показывается в боковой панели, меняется в «Настройках». Хранится в localStorage телевизора.
 */
import { useEffect, useState } from 'preact/hooks';

const NAME_KEY = 'profileName';
const COLOR_KEY = 'profileColor';

/** Цвета аватара — градиенты в духе Apple. */
export const AVATAR_COLORS: { label: string; from: string; to: string }[] = [
  { label: 'Синий', from: '#6e8fb8', to: '#3a4d6b' },
  { label: 'Фиолетовый', from: '#9a7ad6', to: '#5a3f94' },
  { label: 'Розовый', from: '#e07aa8', to: '#a1406e' },
  { label: 'Оранжевый', from: '#f0a25a', to: '#b8612a' },
  { label: 'Зелёный', from: '#6cc08a', to: '#2f7d4f' },
  { label: 'Бирюзовый', from: '#5cc3c9', to: '#277a80' },
  { label: 'Серый', from: '#9aa0a8', to: '#5b6068' },
];

let name = '';
let color = 0;
try {
  name = localStorage.getItem(NAME_KEY) || '';
  const c = Number(localStorage.getItem(COLOR_KEY));
  if (c >= 0 && c < AVATAR_COLORS.length) color = c;
} catch (e) {
  /* без профиля */
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

function store(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch (e) {
    /* без запоминания */
  }
}

export function profileName() {
  return name;
}

export function setProfileName(value: string) {
  name = value.replace(/\s+/g, ' ').trim().slice(0, 20);
  store(NAME_KEY, name);
  changed();
}

export function avatarColor() {
  return AVATAR_COLORS[color];
}

/** Следующий цвет по кругу. */
export function cycleAvatarColor() {
  color = (color + 1) % AVATAR_COLORS.length;
  store(COLOR_KEY, color ? String(color) : '');
  changed();
  return AVATAR_COLORS[color];
}

/** «Анна Петрова» → «АП», «Саша» → «С», пусто — пусто (тогда в аватаре значок). */
export function initials(value = name) {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** Перерисовать компонент при смене имени или цвета. */
export function useProfile() {
  const [, setV] = useState(0);
  useEffect(() => {
    const fn = () => setV((x) => x + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
}
