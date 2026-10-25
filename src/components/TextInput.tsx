/**
 * Окно ввода текста (адрес сервера, ключ): поле и экранная клавиатура для адресов.
 * На компьютере можно печатать обычной клавиатурой, на пульте LG — цифры.
 * «Готово» сохраняет, «Назад» — отмена.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { focusFirstIn, pushBackHandler } from '../core/focus';

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '.:/-_?=&@'];

interface Props {
  title: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onDone: (value: string) => void;
  onCancel: () => void;
}

export function TextInput({ title, hint, value, placeholder, onDone, onCancel }: Props) {
  const [text, setText] = useState(value);
  const [upper, setUpper] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const type = (ch: string) => setText((t) => (t + ch).slice(0, 120));

  useEffect(() => {
    focusFirstIn(root.current!.querySelector('.kb') as HTMLElement);
  }, []);

  useEffect(() => pushBackHandler(onCancel), []);

  // Печать с клавиатуры компьютера и цифр с пульта
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key && e.key.length === 1 && e.key !== ' ') {
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
      </div>
    </div>
  );
}
