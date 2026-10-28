/**
 * Раздел «Настройки»: список в стиле tvOS — слева название, справа значение,
 * «ОК» переключает или открывает ввод. Здесь же — обязательная подпись об источнике данных (TMDB).
 */
import { useEffect, useState } from 'preact/hooks';
import { soundsEnabled, toggleSounds } from '../core/sound';
import { cycleEffects, EFFECTS_LABELS, getEffects, isUltra } from '../core/lite';
import { fpsOn, toggleFps } from '../core/fps';
import { checkTmdbKey, clearCache, hasTmdb, setTmdbKey, tmdbKey } from '../api/tmdb';
import { cycleQuality, getQuality, QUALITY_LABELS } from '../core/quality';
import { echo, setTsUrl, tsUrl } from '../api/torrserver';
import { getParser, setParser } from '../api/releases';
import { checkKpKey, kpKey, kpProblem, setKpKey } from '../api/kinopoisk';
import { switchUiRes, uiRes, uiResAvailable, UI_RES_LABELS, type UiRes } from '../core/resolution';
import { hasWebOS } from '../core/webos';
import { focus, getFocused } from '../core/focus';
import { cycleSaver, saverLabel } from '../core/screensaver';
import { avatarColor, cycleAvatarColor, profileName, setProfileName } from '../core/profile';
import { Avatar } from './Sidebar';
import type { JSX } from 'preact';
import { TextInput } from './TextInput';

const VERSION = __APP_VERSION__; // из public/appinfo.json (vite.config.ts)

interface Row {
  label: string;
  hint: string;
  value: () => string | JSX.Element;
  action: () => void;
}

type Field = 'tmdb' | 'ts' | 'parser' | 'parserKey' | 'kp' | 'name';
type Editing = null | { field: Field; back: HTMLElement | null };

export function SettingsView({ notify }: { notify: (text: string) => void }) {
  const [, redraw] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [tsVersion, setTsVersion] = useState<string | null>(null); // null — проверяем, '' — не отвечает
  const [kpState, setKpState] = useState<string | null>(null); // null — проверяем, иначе готовая надпись
  // Смена разрешения перезапускает приложение — поэтому «ОК» дважды: первое нажатие только спрашивает
  const [resAsk, setResAsk] = useState(false);
  const [resBusy, setResBusy] = useState(false);
  // Переключать есть чем, только если при установке с ПК на ТВ положили оба варианта (scripts/tv.mjs)
  const [resOk, setResOk] = useState(false);
  useEffect(() => {
    if (hasWebOS()) uiResAvailable().then(setResOk);
  }, []);
  // Первый запуск без ключа TMDB открывает «Настройки» (App.tsx) — сразу на строке ключа
  useEffect(() => {
    if (hasTmdb || getFocused()) return;
    const first = document.querySelector('.setting') as HTMLElement | null;
    if (first) focus(first);
  }, []);
  useEffect(() => {
    if (!resAsk) return;
    const t = setTimeout(() => setResAsk(false), 4000);
    return () => clearTimeout(t);
  }, [resAsk]);
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

  const checkKp = (announce: boolean) => {
    if (!kpKey()) return setKpState('Выкл.');
    setKpState(null);
    checkKpKey()
      .then((q) => {
        setKpState(`✓ Вкл. · ещё ${Math.max(0, q.limit - q.used)} запросов`);
        if (announce) notify('Кинопоиск подключён');
      })
      .catch((e: Error) => {
        const problem = kpProblem(e);
        setKpState(problem === 'limit' ? '✕ Лимит на сегодня' : problem ? '✕ Ключ не подходит' : '✕ Нет связи');
        if (announce) notify(problem ? e.message : 'Кинопоиск не отвечает');
      });
  };
  useEffect(() => checkKp(false), []);

  const edit = (field: Field) => setEditing({ field, back: getFocused() });
  const finishEdit = () => {
    const back = editing && editing.back;
    setEditing(null);
    if (back) setTimeout(() => document.body.contains(back) && focus(back), 0);
  };

  const profile: Row[] = [
    {
      label: 'Имя',
      hint: 'Показывается в боковой панели. Буквы имени — на аватаре',
      value: () => profileName() || 'Не указано',
      action: () => edit('name'),
    },
    {
      label: 'Цвет аватара',
      hint: '«ОК» — следующий цвет',
      value: () => (
        <span class="setting__avatar">
          <Avatar />
          {avatarColor().label}
        </span>
      ),
      action: () => cycleAvatarColor(),
    },
  ];

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

  const data: Row[] = [
    {
      label: 'Ключ TMDB',
      hint: 'Откуда берутся фильмы, постеры и описания. Бесплатный ключ: themoviedb.org → Settings → API',
      value: () => (hasTmdb ? '✓ ••••' + tmdbKey().slice(-4) : 'Не указан'),
      action: () => edit('tmdb'),
    },
    {
      label: 'Кинопоиск',
      hint: 'Оценки КП и IMDb, факты, сборы в России. Бесплатный ключ: kinopoiskapiunofficial.tech',
      value: () => (kpState === null ? 'Проверяем…' : kpState),
      action: () => edit('kp'),
    },
  ];

  const otherRes: UiRes = uiRes() === '1280x720' ? '1920x1080' : '1280x720';
  const view: Row[] = [];
  if (resOk) {
    view.push({
      label: 'Разрешение интерфейса',
      hint: '720p — плавнее (для этого ТВ), 1080p — чётче текст. Приложение перезапустится',
      value: () =>
        resBusy
          ? 'Перезапуск…'
          : resAsk
            ? `«ОК» ещё раз — ${UI_RES_LABELS[otherRes]}`
            : UI_RES_LABELS[uiRes()],
      action: () => {
        if (resBusy) return;
        if (!resAsk) return setResAsk(true);
        setResAsk(false);
        setResBusy(true);
        notify(`Переключаем на ${UI_RES_LABELS[otherRes]} — приложение откроется заново через несколько секунд`);
        switchUiRes(otherRes).catch((e: Error) => {
          setResBusy(false);
          notify(e.message);
        });
      },
    });
  }
  view.push(
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
      label: 'Заставка',
      hint: 'Кадры фильмов на весь экран, если долго не нажимать кнопки. Любая кнопка — вернуться',
      value: () => saverLabel(),
      action: () => cycleSaver(),
    },
  );
  if (hasTmdb) {
    view.push({
      label: 'Посмотреть заставку',
      hint: 'Включить заставку сейчас',
      value: () => '',
      action: () => window.dispatchEvent(new CustomEvent('show-saver')),
    });
  }
  view.push(
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
  );

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
          {!hasTmdb && (
            <div class="tabpage__sub">
              Добро пожаловать! Чтобы появились фильмы и сериалы, укажите ключ TMDB — он бесплатный.
            </div>
          )}
        </div>
        {/* Без ключа TMDB главное — ввести его, поэтому этот раздел первым */}
        {!hasTmdb && group('Данные о фильмах', data, true)}
        {group('Профиль', profile, hasTmdb)}
        {group('Источники видео', sources)}
        {hasTmdb && group('Данные о фильмах', data)}
        {group('Приложение', view)}
        <div class="settings__about">
          <b>ATV Lampa {VERSION}</b>
          <div>
            {hasTmdb
              ? 'Данные о фильмах и сериалах, постеры и кадры — The Movie Database (TMDB).' +
                (kpKey() ? ' Оценки и факты — Кинопоиск.' : '')
              : 'Ключ TMDB не задан — показываются временные данные.'}
          </div>
          <div class="settings__tmdb">This product uses the TMDB API but is not endorsed or certified by TMDB.</div>
        </div>
        <div class="page__end" />
      </div>

      {editing && editing.field === 'tmdb' && (
        <TextInput
          title="Ключ TMDB"
          hint="Зарегистрируйтесь на themoviedb.org, откройте Settings → API и скопируйте «API Key» (32 знака). Пусто — выключить."
          value={tmdbKey()}
          placeholder="32 знака: буквы a–f и цифры"
          onCancel={finishEdit}
          onDone={(v) => {
            finishEdit();
            const restart = (text: string) => {
              notify(text);
              setTimeout(() => location.reload(), 1500); // ключ читается при запуске
            };
            if (!v.trim()) {
              if (!hasTmdb) return;
              setTmdbKey('');
              return restart('Ключ TMDB удалён — перезапускаем приложение');
            }
            notify('Проверяем ключ…');
            checkTmdbKey(v).then(
              () => {
                setTmdbKey(v);
                restart('Ключ подходит — перезапускаем приложение');
              },
              (e: Error) => notify(e.message),
            );
          }}
        />
      )}
      {editing && editing.field === 'name' && (
        <TextInput
          title="Имя профиля"
          hint="Например, «Анна» или «Семья». Пусто — без имени."
          value={profileName()}
          placeholder="Ваше имя"
          kind="name"
          maxLength={20}
          onCancel={finishEdit}
          onDone={(v) => {
            setProfileName(v);
            finishEdit();
            notify(v ? `Привет, ${profileName()}!` : 'Имя профиля убрано');
          }}
        />
      )}
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
      {editing && editing.field === 'kp' && (
        <TextInput
          title="Ключ Кинопоиска"
          hint="Зарегистрируйтесь на kinopoiskapiunofficial.tech и скопируйте ключ из профиля (вида 1a2b3c4d-…). Пусто — выключить."
          value={kpKey()}
          placeholder="00000000-0000-0000-0000-000000000000"
          onCancel={finishEdit}
          onDone={(v) => {
            setKpKey(v);
            finishEdit();
            if (v) checkKp(true);
            else {
              setKpState('Выкл.');
              notify('Кинопоиск выключен');
            }
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
