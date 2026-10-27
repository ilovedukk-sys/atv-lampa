/**
 * Вкладка «Поиск»: строка запроса, экранная клавиатура (русская/английская),
 * результаты обновляются сами, пока вы набираете. Пустой запрос — «Популярное».
 * На компьютере можно печатать и обычной клавиатурой, на пульте LG — цифры.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../data/types';
import { hasTmdb, list, search } from '../api/tmdb';
import { ShelfRow } from './ShelfRow';
import { Message } from './Spinner';

const LAYOUTS = {
  ru: ['абвгдеёжзий', 'клмнопрстуф', 'хцчшщъыьэюя', '1234567890'],
  en: ['abcdefghijklm', 'nopqrstuvwxyz', '1234567890'],
};

const DEBOUNCE_MS = 450;

interface Props {
  active: boolean; // вкладка видна и не закрыта экраном фильма
  onOpen: (item: Item) => void;
}

export function SearchView({ active, onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  // Поиск с задержкой: не на каждую букву, а когда набор чуть замер
  useEffect(() => {
    if (!hasTmdb) return;
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(
      () => {
        const q = query.trim();
        (q ? search(q) : list('/trending/all/day'))
          .then((items) => n === seq.current && setResults(items.filter((i) => i.poster)))
          .catch(() => n === seq.current && setResults([]))
          .then(() => n === seq.current && setLoading(false));
      },
      query ? DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(t);
  }, [query]);

  // Печать с клавиатуры компьютера и цифр с пульта
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const ch = e.key && e.key.length === 1 ? e.key.toLowerCase() : '';
      if (ch && /[a-zа-яё0-9 ]/.test(ch)) {
        setQuery((q) => (q + ch).slice(0, 40));
        e.preventDefault();
      } else if (e.keyCode >= 48 && e.keyCode <= 57 && !e.key) {
        setQuery((q) => (q + String(e.keyCode - 48)).slice(0, 40));
      }
    };
    document.addEventListener('keypress', onKey);
    return () => document.removeEventListener('keypress', onKey);
  }, [active]);

  const type = (ch: string) => setQuery((q) => (q + ch).slice(0, 40));

  if (!hasTmdb) {
    return (
      <div class="page" data-scroll-y>
        <Message title="Поиск работает через TMDB" text="Укажите ключ TMDB в «Настройках»." />
      </div>
    );
  }

  return (
    <div class="page" data-scroll-y>
      <section class="search__top" data-section data-section-top>
        <div class="search__field">
          {query ? <span>{query}</span> : <span class="search__placeholder">Фильмы и сериалы</span>}
          <i class="search__caret" />
        </div>
        <div class="kb">
          {LAYOUTS[lang].map((row) => (
            <div class="kb__row" key={row}>
              {row.split('').map((ch) => (
                <button class="kb__key" data-focusable key={ch} onClick={() => type(ch)}>
                  {ch}
                </button>
              ))}
            </div>
          ))}
          <div class="kb__row">
            <button class="kb__key kb__key--wide" data-focusable onClick={() => type(' ')}>
              Пробел
            </button>
            <button class="kb__key kb__key--mid" data-focusable onClick={() => setQuery((q) => q.slice(0, -1))}>
              ⌫
            </button>
            <button class="kb__key kb__key--mid" data-focusable onClick={() => setQuery('')}>
              Очистить
            </button>
            <button
              class="kb__key kb__key--mid"
              data-focusable
              onClick={() => setLang((l) => (l === 'ru' ? 'en' : 'ru'))}
            >
              {lang === 'ru' ? 'ABC' : 'АБВ'}
            </button>
          </div>
        </div>
      </section>

      {results.length > 0 ? (
        <ShelfRow
          key={query.trim() || 'popular'}
          shelf={{
            id: 'results',
            title: query.trim() ? `Найдено: ${results.length}` : 'Популярное сегодня',
            kind: 'poster',
            items: results,
          }}
          onSelect={onOpen}
        />
      ) : (
        <div class="search__empty">{loading ? 'Ищем…' : query.trim() ? 'Ничего не найдено' : ''}</div>
      )}
      <div class="page__end" />
    </div>
  );
}
