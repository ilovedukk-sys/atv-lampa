/** Индикатор загрузки и сообщение об ошибке — по центру экрана. */
export function Spinner({ text }: { text?: string }) {
  return (
    <div class="loading">
      <div class="spinner" />
      {text && <div class="loading__text">{text}</div>}
    </div>
  );
}

export function Message({ title, text }: { title: string; text?: string }) {
  return (
    <div class="message">
      <div class="message__title">{title}</div>
      {text && <div class="message__text">{text}</div>}
    </div>
  );
}
