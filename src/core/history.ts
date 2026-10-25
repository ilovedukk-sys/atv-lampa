/**
 * История просмотра: где остановились в каждом фильме/серии и какую раздачу смотрели.
 * По ней работает «Продолжить» на экране фильма (сразу в плеер, без выбора раздачи)
 * и продолжение с того же места. Хранится в localStorage телевизора.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Item } from '../data/types';

const KEY = 'history1';
const MAX = 60;

export interface WatchEntry {
  itemId: string; // 'movie:603' / 'tv:1399'
  item: Item; // карточка — для полки «Продолжить просмотр»
  hash: string;
  link: string;
  fileId: number;
  filePath: string;
  label: string; // «С1 Э3» или имя файла
  time: number; // секунды
  duration: number;
  updated: number;
}

const listeners = new Set<() => void>();

function load(): WatchEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch (e) {
    return [];
  }
}

let entries: WatchEntry[] = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch (e) {
    /* без запоминания */
  }
  listeners.forEach((fn) => fn());
}

/** Последнее, что смотрели в этом фильме/сериале. */
export function lastWatch(itemId: string): WatchEntry | undefined {
  return entries.filter((e) => e.itemId === itemId)[0];
}

/** Позиция в конкретном файле раздачи (для продолжения с того же места). */
export function positionOf(hash: string, fileId: number): number {
  const e = entries.filter((x) => x.hash === hash && x.fileId === fileId)[0];
  return e ? e.time : 0;
}

/** Запомнить позицию. Запись по фильму/сериалу одна — самая свежая серия. */
export function remember(e: Omit<WatchEntry, 'updated'>, notify = false) {
  entries = [{ ...e, updated: Date.now() }]
    .concat(entries.filter((x) => x.itemId !== e.itemId))
    .slice(0, MAX);
  // Пока идёт видео, пишем тихо: перерисовывать экраны под плеером незачем
  if (notify) save();
  else
    try {
      localStorage.setItem(KEY, JSON.stringify(entries));
    } catch (err) {
      /* без запоминания */
    }
}

/** Сообщить экранам, что история изменилась (после закрытия плеера). */
export function historyChanged() {
  listeners.forEach((fn) => fn());
}

/** Досмотрели почти до конца — считаем просмотренным, «Продолжить» не нужно. */
export function finished(e: { time: number; duration: number }) {
  return e.duration > 0 && e.time > e.duration - Math.min(300, e.duration * 0.06);
}

/** Для полки «Продолжить просмотр»: начатые и недосмотренные. */
export function continueItems(): WatchEntry[] {
  return entries.filter((e) => e.time > 30 && !finished(e));
}

export function useHistoryVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const fn = () => setV((x) => x + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return v;
}

/** «1:02:05» / «12:05». */
export function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = ('0' + (s % 60)).slice(-2);
  return h ? `${h}:${('0' + m).slice(-2)}:${ss}` : `${m}:${ss}`;
}

/** «Осталось 1 ч 12 мин». */
export function remaining(e: { time: number; duration: number }) {
  const min = Math.max(1, Math.round((e.duration - e.time) / 60));
  const h = Math.floor(min / 60);
  return `Осталось ${h ? `${h} ч ` : ''}${min % 60 ? `${min % 60} мин` : ''}`.trim();
}
