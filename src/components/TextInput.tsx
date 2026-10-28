/**
 * Окно ввода текста (адрес сервера, ключ, имя профиля): поле и экранная клавиатура —
 * для адресов латиница и знаки, для имени (kind="name") русская/английская с пробелом.
 * На компьютере можно печатать обычной клавиатурой, на пульте LG — цифры.
 * «Готово» сохраняет, «Назад» — отмена.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { focusFirstIn, pushBackHandler } from '../core/focus';

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '.:/-_?=&@'];
// Для имени — русская и английская раскладки, как в «Поиске»
const NAME_ROWS = {
  ru: ['абвгдеёжзий', 'клмнопрстуф', 'хцчшщъыьэюя'],
  en: ['abcdefghijklm', 'nopqrstuvwxyz'],
};

interface Props {
  title: string;
  hint?: string;
  value: string;
  placeholder?: string;
  kind?: 'address' | 'name'; // name — русские буквы, пробел, заглавная в начале слова
  maxLength?: number;
  onDone: (value: string) => void;
  onCancel: () => void;
}

export function TextInput({ title, hint, value, placeholder, kind = 'address', maxLength = 120, onDone, onCancel }: Props) {
  const [text, setText] = useState(value);
  const [upper, setUpper] = useState(false);
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const root = useRef<HTMLDivElement>(null);
  const name = kind === 'name';
  const type = (ch: string) =>
    setText((t) => {
      // Имя: первая буква слова — заглавная
      const c = name && (t === '' || t.slice(-1) === ' ') ? ch.toUpperCase() : ch;
      return (t + c).slice(0, maxLength);
    });

  useEffect(() => {
    focusFirstIn(root.current!.querySelector('.kb') as HTMLElement);
  }, []);

  useEffect(() => pushBackHandler(onCancel), []);

  // Печать с клавиатуры компьютера и цифр с пульта
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key && e.key.length === 1 && (e.key !== ' ' || name)) {
        type(e.key);
        e.preventDefault();
      } else if (e.keyCode >= 48 && e.keyCode <= 57 && !e.key) {
        type(String(e.keyCode - 48));
      }
    };
    // Backspace на компьютере стирает букву, а не закрывает окно
    const onDown = (e: KeyboardEvent) => {
      if (e.keyCode === 8) {
        setText((t) => t.slice(0, -1));
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keypress', onKey);
    window.addEventListener('keydown', onDown, true);
    return () => {
      document.removeEventListener('keypress', onKey);
      window.removeEventListener('keydown', onDown, true);
    };
  }, []);

  return (
    <div ref={root} class="overlay" data-screen>
      <div class="input__panel glass">
        <h2>{title}</h2>
        {hint && <div class="input__hint">{hint}</div>}
        <div class="search__field input__field">
          {text ? <span>{text}</span> : <span class="search__placeholder">{placeholder}</span>}
          <i class="search__caret" />
        </div>
        {name ? (
          <div class="kb">
            {NAME_ROWS[lang].map((row) => (
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
              <button class="kb__key kb__key--mid" data-focusable onClick={() => setText((t) => t.slice(0, -1))}>
                ⌫
              </button>
              <button class="kb__key kb__key--mid" data-focusable onClick={() => setLang((l) => (l === 'ru' ? 'en' : 'ru'))}>
                {lang === 'ru' ? 'ABC' : 'АБВ'}
              </button>
              <button class="kb__key kb__key--mid kb__key--done" data-focusable onClick={() => onDone(text.trim())}>
                Готово
              </button>
            </div>
          </div>
        ) : (
        <div class="kb">
          {ROWS.map((row) => (
            <div class="kb__row" key={row}>
              {row.split('').map((ch) => {
                const c = upper ? ch.toUpperCase() : ch;
                return (
                  <button class="kb__key" data-focusable key={ch} onClick={() => type(c)}>
                    {c}
                  </button>
                );
              })}
            </div>
          ))}
          <div class="kb__row">
            <button class="kb__key kb__key--mid" data-focusable onClick={() => setUpper((u) => !u)}>
              {upper ? 'abc' : 'ABC'}
            </button>
            <button class="kb__key kb__key--mid" data-focusable onClick={() => setText((t) => t.slice(0, -1))}>
              ⌫
            </button>
            <button class="kb__key kb__key--mid" data-focusable onClick={() => setText('')}>
              Очистить
            </button>
            <button class="kb__key kb__key--mid kb__key--done" data-focusable onClick={() => onDone(text.trim())}>
              Готово
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
