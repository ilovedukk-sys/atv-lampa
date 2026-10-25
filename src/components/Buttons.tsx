/**
 * Кнопки в стиле tvOS. Все фокусируемые пультом.
 *   PlayButton    — главная белая кнопка «Смотреть» / «Продолжить»
 *   RoundButton   — круглая кнопка с иконкой
 *   TextButton    — второстепенная кнопка с текстом
 *   LibraryButton — «+» / «✓»: добавить в медиатеку
 */
import type { ComponentChildren } from 'preact';
import type { Item } from '../data/types';
import { toggleLibrary, useInLibrary } from '../core/library';
import { CheckIcon, PlayIcon, PlusIcon } from './Icons';

export function PlayButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button class="btn btn--primary" data-focusable onClick={onClick}>
      <PlayIcon />
      <span>{label}</span>
    </button>
  );
}

export function RoundButton(props: { label: string; onClick: () => void; children: ComponentChildren }) {
  return (
    <button class="btn btn--round" data-focusable aria-label={props.label} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

export function TextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button class="btn btn--text" data-focusable onClick={onClick}>
      {label}
    </button>
  );
}

export function LibraryButton({ item, onChange }: { item: Item; onChange?: (added: boolean) => void }) {
  const added = useInLibrary(item.id);
  return (
    <RoundButton
      label={added ? 'Убрать из медиатеки' : 'В медиатеку'}
      onClick={() => {
        const now = toggleLibrary(item);
        if (onChange) onChange(now);
      }}
    >
      {added ? <CheckIcon /> : <PlusIcon />}
    </RoundButton>
  );
}

/** Бейдж в рамке: «16+», «4K», «HDR». */
export function Badge({ children }: { children: ComponentChildren }) {
  return <span class="badge">{children}</span>;
}
