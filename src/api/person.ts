/**
 * Страница актёра (режиссёра…) из TMDB: фото, биография, известные работы, фильмы и сериалы.
 * Один запрос вместе с фильмографией; если русской биографии нет — второй, за английской.
 */
import type { Item } from '../data/types';
import { cached, loadGenres, request, toItem } from './tmdb';
import { longDate } from './details';

export interface Person {
  id: string;
  name: string; // по-русски, если TMDB его знает
  originalName?: string; // «Keanu Reeves» — если имя показали по-русски
  photo?: string;
  profession: string; // «Актёр», «Актриса», «Режиссёр»…
  facts: string[]; // «Родился 2 сентября 1964 (62 года)», «Бейрут, Ливан»
  bio: string;
  known: Item[]; // самые известные работы — по числу оценок
  directed: Item[];
  movies: Item[];
  shows: Item[];
}

/** 'person:6384' → 6384. */
export function parsePersonId(id: string): number | null {
  const m = /^person:(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

const SHELF_LIMIT = 20;
// Ток-шоу, новости, реалити — там актёр играет самого себя
const NOT_ROLES = [10767, 10763, 10764];
const SELF = /\b(self|himself|herself|themselves)\b|archive footage|сам себя|самого себя|саму себя|самих себя/i;
// Эмодзи в биографиях (их пишут пользователи TMDB) — на ТВ без таких шрифтов это пустые квадраты
const EMOJI = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[☀-➿️]/g;
// Украинские буквы — чтобы из «также известен как» взять именно русское написание
const NOT_RUSSIAN = /[іїєґўІЇЄҐЎ]/;
const RUSSIAN = /^[А-Яа-яЁё][А-Яа-яЁё .'-]+$/;

const PROFESSIONS: Record<string, [string, string]> = {
  Acting: ['Актёр', 'Актриса'],
  Directing: ['Режиссёр', 'Режиссёр'],
  Writing: ['Сценарист', 'Сценаристка'],
  Production: ['Продюсер', 'Продюсер'],
  Sound: ['Композитор', 'Композитор'],
  Camera: ['Оператор', 'Оператор'],
  Editing: ['Монтажёр', 'Монтажёр'],
  Creator: ['Создатель', 'Создательница'],
};

export async function loadPerson(item: Item): Promise<Person | null> {
  const id = parsePersonId(item.id);
  if (!id) return null;
  await loadGenres();
  return cached(`person1:${id}`, 24, async () => {
    const r = await request<any>(`/person/${id}`, { append_to_response: 'combined_credits' });
    let bio: string = r.biography || '';
    if (!bio.trim()) {
      const en = await request<any>(`/person/${id}`, { language: 'en-US' }).catch(() => null);
      bio = (en && en.biography) || '';
    }
    bio = bio.replace(EMOJI, '').trim();

    const female = r.gender === 1;
    const ru = ((r.also_known_as as string[]) || []).filter((n) => RUSSIAN.test(n) && !NOT_RUSSIAN.test(n))[0];
    const credits = r.combined_credits || {};
    const roles: any[] = ((credits.cast as any[]) || []).filter(
      (c) => !c.adult && !SELF.test(c.character || '') && !(c.genre_ids || []).some((g: number) => NOT_ROLES.indexOf(g) !== -1),
    );
    const directing: any[] = ((credits.crew as any[]) || []).filter((c) => c.job === 'Director' && !c.adult);
    const isDirector = r.known_for_department === 'Directing';

    const prof = PROFESSIONS[r.known_for_department] || PROFESSIONS.Acting;
    return {
      id: item.id,
      name: ru || r.name || item.title,
      originalName: ru && r.name !== ru ? r.name : undefined,
      photo: r.profile_path || item.poster,
      profession: prof[female ? 1 : 0],
      facts: lifeFacts(r, female),
      bio,
      known: toItems(byFame(isDirector ? directing.concat(roles) : roles.concat(directing)), (c) => c.backdrop_path, 15),
      directed: toItems(byDate(directing), (c) => c.poster_path),
      movies: toItems(byDate(roles.filter((c) => c.media_type === 'movie')), (c) => c.poster_path),
      shows: toItems(byDate(roles.filter((c) => c.media_type === 'tv')), (c) => c.poster_path),
    } as Person;
  });
}

/** Работы → карточки: без повторов (актёр бывает в сериале несколько раз), только с картинкой. */
function toItems(list: any[], hasImage: (c: any) => boolean, limit = SHELF_LIMIT): Item[] {
  const seen: Record<string, true> = {};
  const out: Item[] = [];
  list.forEach((c) => {
    const item = hasImage(c) && toItem(c, c.media_type);
    if (!item || seen[item.id] || out.length >= limit) return;
    seen[item.id] = true;
    // Под карточкой — год и роль: «1999 · Нео»
    const role = c.character || (c.job === 'Director' ? 'режиссёр' : '');
    out.push({ ...item, meta: [item.year, role].filter(Boolean).join(' · ') });
  });
  return out;
}

const byFame = (list: any[]) => list.slice().sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

// Новые сверху; без даты (только анонсированные, часто без названия) — в конце
const dateOf = (c: any) => c.release_date || c.first_air_date || '0000';
const byDate = (list: any[]) => list.slice().sort((a, b) => dateOf(b).localeCompare(dateOf(a)));

function lifeFacts(r: any, female: boolean): string[] {
  const out: string[] = [];
  if (r.birthday) {
    const born = `${female ? 'Родилась' : 'Родился'} ${longDate(r.birthday)}`;
    out.push(r.deathday ? born : `${born} (${years(ageAt(r.birthday))})`);
  }
  if (r.deathday) {
    const died = `${female ? 'Умерла' : 'Умер'} ${longDate(r.deathday)}`;
    out.push(r.birthday ? `${died} (${years(ageAt(r.birthday, r.deathday))})` : died);
  }
  if (r.place_of_birth) out.push(r.place_of_birth);
  return out;
}

function ageAt(birth: string, end?: string) {
  const b = birth.split('-').map(Number);
  const now = new Date();
  const e = end ? end.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  return e[0] - b[0] - (e[1] < b[1] || (e[1] === b[1] && e[2] < b[2]) ? 1 : 0);
}

/** 61 → «61 год», 62 → «62 года», 65 → «65 лет». */
function years(n: number) {
  const last = n % 10;
  const tens = n % 100;
  const word = tens >= 11 && tens <= 14 ? 'лет' : last === 1 ? 'год' : last >= 2 && last <= 4 ? 'года' : 'лет';
  return `${n} ${word}`;
}
