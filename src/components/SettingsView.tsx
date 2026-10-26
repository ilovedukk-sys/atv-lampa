/**
 * Раздел «Настройки»: список в стиле tvOS — слева название, справа значение,
 * «ОК» переключает или открывает ввод. Здесь же — обязательная подпись об источнике данных (TMDB).
 */
import { useEffect, useState } from 'preact/hooks';
import { soundsEnabled, toggleSounds } from '../core/sound';
import { cycleEffects, EFFECTS_LABELS, getEffects, isUltra } from '../core/lite';
import { fpsOn, toggleFps } from '../core/fps';
import { clearCache, hasTmdb } from '../api/tmdb';
import { cycleQuality, getQuality, QUALITY_LABELS } from '../core/quality';
import { echo, setTsUrl, tsUrl } from '../api/torrserver';
import { getParser, setParser } from '../api/releases';
import { focus, getFocused } from '../core/focus';
import { TextInput } from './TextInput';

const VERSION = '0.5.0';

interface Row {
  label: string;
  hint: string;
  value: () => string;
  action: () => void;
}

type Editing = null | { field: 'ts' | 'parser' | 'parserKey'; back: HTMLElement | null };

export function SettingsView({ notify }: { notify: (text: string) => void }) {
  const [, redraw] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [tsVersion, setTsVersion] = useState<string | null>(null); // null — проверяем, '' — не отвечает
  const onOff = (v: boolean) => (v ? 'Вкл.' : 'Выкл.');
  const short = (url: string) => url.replace(/^https?:\/\//, '');

  const checkTs = (announce: boolean) => {
    if (!tsUrl()) return setTsVersion('');
    setTsVersion(null);
    echo()
      .then((v) => {
        setTsVersion(v);
        if (announce) notify(`TorrServer подключён: ${v}`);
      })
      .catch(() => {
        setTsVersion('');
        if (announce) notify('TorrServer не отвечает по этому адресу');
      });
  };
  useEffect(() => checkTs(false), []);

  const edit = (field: 'ts' | 'parser' | 'parserKey') => setEditing({ field, back: getFocused() });
  const finishEdit = () => {
    const back = editing && editing.back;
    setEditing(null);
    if (back) setTimeout(() => document.body.contains(back) && focus(back), 0);
  };

  const sources: Row[] = [
    {
      label: 'TorrServer',
      hint: 'Адрес сервера, через который смотрим торренты, например 192.168.0.15:8090',
      value: () =>
        !tsUrl() ? 'Не указан' : tsVersion === null ? 'Проверяем…' : tsVersion ? `✓ ${short(tsUrl())}` : `✕ ${short(tsUrl())}`,
      action: () => edit('ts'),
    },
    {
      label: 'Парсер раздач',
      hint: 'Необязательно. Поиск в формате Jackett: Jackett, Prowlarr или jacred',
      value: () => (getParser().url ? short(getParser().url) : 'Не указан'),
      action: () => edit('parser'),
    },
  ];
  if (getParser().url) {
    sources.push({
      label: 'Ключ парсера',
      hint: 'API Key из настроек Jackett/Prowlarr (для jacred не нужен)',
      value: () => (getParser().key ? '••••' + getParser().key.slice(-4) : 'Нет'),
      action: () => edit('parserKey'),
    });
  }

  const view: Row[] = [
    {
      label: 'Качество обложек',
      hint: 'Низкое — меньше трафика и памяти, плавнее на слабых ТВ; высокое — чётче',
      value: () => (isUltra() ? 'Низкое (мин. режим)' : QUALITY_LABELS[getQuality()]),
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
      label: 'Эффекты',
      hint: 'Облегчённый — без размытия и выплывания; минимальный — для самых слабых ТВ: без анимаций и теней. Зелёная кнопка',
      value: () => EFFECTS_LABELS[getEffects()],
      // notify перерисовывает приложение — в минимальном режиме обложки сразу станут легче
      action: () => notify(`Эффекты: ${EFFECTS_LABELS[cycleEffects()].toLowerCase()}`),
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

  const group = (title: string, rows: Row[], top = false) => (
    <section class="settings" data-section data-section-top={top || undefined}>
      <h3 class="settings__group">{title}</h3>
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
  );

  return (
    <>
      <div class="page" data-scroll-y>
        <div class="tabpage__head">
          <h1>Настройки</h1>
        </div>
        {group('Источники видео', sources, true)}
        {group('Приложение', view)}
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

      {editing && editing.field === 'ts' && (
        <TextInput
          title="Адрес TorrServer"
          hint="IP-адрес компьютера или приставки с TorrServer. Порт 8090 добавится сам."
          value={short(tsUrl())}
          placeholder="192.168.0.15:8090"
          onCancel={finishEdit}
          onDone={(v) => {
            setTsUrl(v);
            finishEdit();
            checkTs(true);
          }}
        />
      )}
      {editing && editing.field === 'parser' && (
        <TextInput
          title="Парсер раздач"
          hint="Адрес Jackett / Prowlarr / jacred, например 192.168.0.15:9117. Пусто — выключить."
          value={short(getParser().url)}
          placeholder="192.168.0.15:9117"
          onCancel={finishEdit}
          onDone={(v) => {
            setParser({ url: v });
            finishEdit();
            notify(v ? 'Парсер сохранён' : 'Парсер выключен');
          }}
        />
      )}
      {editing && editing.field === 'parserKey' && (
        <TextInput
          title="Ключ парсера"
          hint="API Key из веб-страницы Jackett или Prowlarr."
          value={getParser().key}
          onCancel={finishEdit}
          onDone={(v) => {
            setParser({ key: v });
            finishEdit();
          }}
        />
      )}
    </>
  );
}
