/**
 * Раздел «Настройки»: список в стиле tvOS — слева название, справа значение,
 * «ОК» переключает. Здесь же — обязательная подпись об источнике данных (TMDB).
 */
import { useState } from 'preact/hooks';
import { soundsEnabled, toggleSounds } from '../core/sound';
import { isLite, toggleLite } from '../core/lite';
import { fpsOn, toggleFps } from '../core/fps';
import { clearCache, hasTmdb } from '../api/tmdb';
import { cycleQuality, getQuality, QUALITY_LABELS } from '../core/quality';

const VERSION = '0.4.0';

interface Row {
  label: string;
  hint: string;
  value: () => string;
  action: () => void;
}

export function SettingsView({ notify }: { notify: (text: string) => void }) {
  const [, redraw] = useState(0);
  const onOff = (v: boolean) => (v ? 'Вкл.' : 'Выкл.');

  const rows: Row[] = [
    {
      label: 'Качество обложек',
      hint: 'Низкое — меньше трафика и памяти, плавнее на слабых ТВ; высокое — чётче',
      value: () => QUALITY_LABELS[getQuality()],
      // notify перерисовывает приложение — обложки сразу перезагружаются в новом размере
      action: () => notify(`Качество обложек: ${QUALITY_LABELS[cycleQuality()].toLowerCase()}`),
    },
    {
      label: 'Звуки навигации',
      hint: 'Щелчки при перемещении и выборе. Жёлтая кнопка пульта',
      value: () => onOff(soundsEnabled()),
      action: toggleSounds,
    },
    {
      label: 'Облегчённый режим',
      hint: 'Без размытого фона и анимаций — плавнее на слабых ТВ. Зелёная кнопка',
      value: () => onOff(isLite()),
      action: toggleLite,
    },
    {
      label: 'Счётчик FPS',
      hint: 'Частота кадров в углу экрана. Красная кнопка',
      value: () => onOff(fpsOn()),
      action: toggleFps,
    },
    {
      label: 'Очистить кеш',
      hint: 'Заново загрузить подборки и описания из TMDB',
      value: () => '',
      action: () => {
        clearCache();
        notify('Кеш очищен — данные загрузятся заново');
      },
    },
  ];

  return (
    <div class="page" data-scroll-y>
      <div class="tabpage__head">
        <h1>Настройки</h1>
      </div>
      <section class="settings" data-section data-section-top>
        {rows.map((r) => (
          <button
            key={r.label}
            class="setting"
            data-focusable
            onClick={() => {
              r.action();
              redraw((x) => x + 1);
            }}
          >
            <span class="setting__text">
              <span class="setting__label">{r.label}</span>
              <span class="setting__hint">{r.hint}</span>
            </span>
            <span class="setting__value">{r.value()}</span>
          </button>
        ))}
      </section>
      <div class="settings__about">
        <b>ATV Lampa {VERSION}</b>
        <div>
          {hasTmdb
            ? 'Данные о фильмах и сериалах, постеры и кадры — The Movie Database (TMDB).'
            : 'Ключ TMDB не задан — показываются временные данные.'}
        </div>
        <div class="settings__tmdb">This product uses the TMDB API but is not endorsed or certified by TMDB.</div>
      </div>
      <div class="page__end" />
    </div>
  );
}
