/**
 * Окно «ЕЩЁ» поверх экрана: полное описание, биография, строки «название — значение».
 * Длинный текст, который не помещается, листается стрелками ↑/↓. «ОК» или «Назад» — закрыть.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const STEP = 180; // на сколько пикселей листает одно нажатие

export function Overlay({ onClose, children }: { onClose: () => void; children: ComponentChildren }) {
  const body = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);

  useEffect(() => {
    const el = body.current!;
    if (el.scrollHeight <= el.clientHeight + 4) return;
    setLong(true);
    // Перехватываем стрелки раньше движка фокуса (capture на window), как в плеере
    const onKey = (e: KeyboardEvent) => {
      if (e.keyCode !== 38 && e.keyCode !== 40) return;
      el.scrollTop += e.keyCode === 40 ? STEP : -STEP;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div class="overlay" data-screen>
      <div class="overlay__panel glass" data-focusable onClick={onClose}>
        <div ref={body} class="overlay__body">
          {children}
        </div>
        <div class="overlay__hint">{long ? '↑ ↓ — листать · ' : ''}«ОК» или «Назад» — закрыть</div>
      </div>
    </div>
  );
}
