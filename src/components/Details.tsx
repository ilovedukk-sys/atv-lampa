/**
 * Экран фильма / сериала в стиле Apple TV:
 * полноэкранный фон, название (логотип), мета-строка с бейджами, описание (по «ОК» — целиком),
 * кнопки, затем — сезоны и серии (для сериалов), актёры, похожее.
 *
 * Открывается мгновенно с тем, что известно из карточки; остальное подгружается из TMDB.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../data/types';
import { getDetails, quickDetails, type Details } from '../data/details';
import { hasTmdb, parseId } from '../api/tmdb';
import { loadDetails, loadSeason } from '../api/details';
import { focus, focusedClass, focusFirstIn, getFocused, pushBackHandler } from '../core/focus';
import { Badge, LibraryButton, PlayButton, TextButton } from './Buttons';
import { Card } from './Card';
import { ShelfRow } from './ShelfRow';
import { BackdropImage, TitleLogo } from './Hero';
import { AboutSection, InfoSection, type MoreContent } from './About';
import { finished, lastWatch, remaining, useHistoryVersion } from '../core/history';
import type { WatchOptions } from '../App';

interface Props {
  item: Item;
  active: boolean; // верхний экран (остальные скрыты, но помнят состояние)
  onOpen: (item: Item) => void;
  onWatch: (item: Item, opts?: WatchOptions) => void;
  onClose: () => void;
  notify: (text: string) => void;
}

const fromTmdb = (item: Item) => hasTmdb && !!parseId(item.id);

// Сколько длится появление экрана (riseIn в app.css) — до его конца нижние разделы не строим
const OPEN_ANIMATION_MS = 450;

export function DetailsScreen({ item, active, onOpen, onWatch, onClose, notify }: Props) {
  const [d, setD] = useState<Details>(() => (fromTmdb(item) ? quickDetails(item) : getDetails(item)));
  const root = useRef<HTMLDivElement>(null);
  const desc = useRef<HTMLDivElement>(null);
  // Окно «ЕЩЁ»: полное описание или панель из нижних разделов
  const [more, setMore] = useState<MoreContent | 'desc' | null>(null);
  const moreFrom = useRef<HTMLElement | null>(null);
  const openMore = (content: MoreContent | 'desc') => {
    moreFrom.current = getFocused();
    setMore(content);
  };

  /*
   * Нижние разделы (сезоны → актёры → похожее) достраиваем по одному с паузами,
   * когда данные готовы: на слабом ТВ построить всё сразу = кадр, замерший на ~100 мс.
   */
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!d.loaded) return;
    let n = 0;
    let t = 0;
    const step = () => {
      n++;
      setShown(n);
      if (n < 5) t = window.setTimeout(step, 160);
    };
    // Первый раздел — после анимации открытия (0,4 с): пока она идёт, процессор ТВ ей не мешаем
    t = window.setTimeout(step, OPEN_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [d.loaded]);

  // Подробности из TMDB
  useEffect(() => {
    if (d.loaded) return;
    let alive = true;
    loadDetails(item)
      .then((full) => alive && full && setD(full))
      .catch(() => alive && notify('Не удалось загрузить данные TMDB'));
    return () => {
      alive = false;
    };
  }, []);

  // При открытии экрана фокус — на кнопку «Смотреть»
  useEffect(() => {
    focusFirstIn(root.current!.querySelector('.details__buttons') as HTMLElement);
  }, []);

  // «Назад»: сначала закрывает окно описания, потом сам экран
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => (more ? setMore(null) : onClose()));
  }, [active, more]);

  // Окно описания: фокус внутрь, после закрытия — обратно на описание
  useEffect(() => {
    if (more) {
      focusFirstIn(root.current!.querySelector('.overlay') as HTMLElement);
    } else if (moreFrom.current) {
      const back = moreFrom.current;
      moreFrom.current = null;
      if (document.body.contains(back)) focus(back);
    }
  }, [more]);

  const soon = (what: string, stage: number) => () => notify(`${what} появится на этапе ${stage}`);
  const it = d.item;

  // «Продолжить» — если начали смотреть и не досмотрели (история обновляется после плеера)
  useHistoryVersion();
  const last = lastWatch(it.id);
  const resumable = !!last && last.time > 30 && !finished(last);
  const playLabel = resumable ? 'Продолжить' : d.kind === 'show' ? 'Смотреть сериал' : 'Смотреть';
  const startWatch = () => onWatch(it, resumable ? { resume: last } : {});
  const pickEpisode = (ep: Item) => {
    const m = /:s(\d+)e(\d+)$/.exec(ep.id);
    if (!m) return notify('Серии загружаются…');
    onWatch(it, { episode: { season: Number(m[1]), episode: Number(m[2]) } });
  };

  return (
    <div ref={root} class={`screen details${active ? '' : ' is-hidden'}`} data-screen>
      <div class="backdrop__slide">
        <BackdropImage item={it} soft={false} />
      </div>

      <div class="page" data-scroll-y>
        <section class="details__top" data-section data-section-top>
          <div class="details__info">
            <TitleLogo item={it} logo={d.logo} cls="details__logo" />
            <Meta d={d} />
            <div ref={desc} class="details__desc" data-focusable onClick={() => openMore('desc')}>
              <p>{d.description || (d.loaded ? 'Описание отсутствует.' : '…')}</p>
              <div class="details__more">ЕЩЁ</div>
            </div>
            {resumable && (
              <div class="details__progress">
                <span class="details__bar">
                  <i style={{ width: `${Math.round((last!.time / last!.duration) * 100)}%` }} />
                </span>
                {[last!.label, remaining(last!)].filter(Boolean).join(' · ')}
              </div>
            )}
            <div class="details__buttons">
              <PlayButton label={playLabel} onClick={startWatch} />
              <LibraryButton
                item={it}
                onChange={(added) => notify(added ? `«${it.title}» в медиатеке` : `«${it.title}» убран из медиатеки`)}
              />
              {resumable && <TextButton label="Раздачи" onClick={() => onWatch(it)} />}
              <TextButton label="Трейлер" onClick={soon('Трейлер', 7)} />
            </div>
          </div>
        </section>

        {shown >= 1 && d.kind === 'show' && d.seasons.length > 0 && (
          <Seasons d={d} onSelect={pickEpisode} />
        )}
        {shown >= 2 && d.cast.length > 0 && (
          <ShelfRow
            shelf={{ id: 'cast', title: 'Актёры и съёмочная группа', kind: 'person', items: d.cast }}
            onSelect={() => notify('Страница актёра появится позже')}
          />
        )}
        {shown >= 3 && d.similar.length > 0 && (
          <ShelfRow shelf={{ id: 'similar', title: 'Похожее', kind: 'poster', items: d.similar }} onSelect={onOpen} />
        )}
        {/* Подробности — на сером фоне, как в Apple TV: кадр фильма за ними не мешает читать */}
        {shown >= 4 && d.info && <div class="details__fade" />}
        {shown >= 4 && d.info ? (
          <div class="details__lower">
            <AboutSection d={d} onMore={openMore} />
            {shown >= 5 && <InfoSection d={d} onMore={openMore} />}
            <div class="page__end" />
          </div>
        ) : (
          <div class="page__end" />
        )}
      </div>

      {more && (
        <div class="overlay" data-screen>
          <div class="overlay__panel glass" data-focusable onClick={() => setMore(null)}>
            {more === 'desc' ? (
              <>
                <h2>{it.title}</h2>
                <p>{d.description}</p>
                <div class="overlay__info">
                  {d.genres.length > 0 && (
                    <div>
                      <b>Жанр</b>
                      {d.genres.join(', ')}
                    </div>
                  )}
                  {d.year && (
                    <div>
                      <b>Год</b>
                      {d.year}
                    </div>
                  )}
                  {d.director && (
                    <div>
                      <b>{d.kind === 'show' ? 'Создатель' : 'Режиссёр'}</b>
                      {d.director}
                    </div>
                  )}
                  {d.rating && (
                    <div>
                      <b>Рейтинг TMDB</b>
                      {d.rating}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2>{more.title}</h2>
                {more.text && <p>{more.text}</p>}
                {more.rows.length > 0 && (
                  <div class="overlay__rows">
                    {more.rows.map(([k, v]) => (
                      <div key={k}>
                        <b>{k}</b>
                        {v}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div class="overlay__hint">«ОК» или «Назад» — закрыть</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ d }: { d: Details }) {
  const parts = [d.genres.join(', '), d.year, d.runtime].filter(Boolean);
  return (
    <div class="details__meta">
      <span>{parts.join(' · ')}</span>
      {d.age && <Badge>{d.age}</Badge>}
      {d.badges.map((b) => (
        <Badge key={b}>{b}</Badge>
      ))}
      {d.rating && <span class="details__rating">★ {d.rating}</span>}
    </div>
  );
}

/** Сезоны и серии. Сезон переключается, как только на него навели (как в tvOS). */
function Seasons({ d, onSelect }: { d: Details; onSelect: (item: Item) => void }) {
  const [season, setSeason] = useState(0);
  const [loaded, setLoaded] = useState<Record<number, Item[]>>({});
  const s = d.seasons[season];
  const episodes = s.episodes || loaded[s.number];
  const section = useRef<HTMLElement>(null);

  // Заглушки сменились настоящими сериями — если фокус был на заглушке, ставим на первую серию
  useEffect(() => {
    const f = getFocused();
    if (f && !document.body.contains(f) && section.current) {
      focusFirstIn(section.current.querySelector('.shelf__track') as HTMLElement);
    }
  }, [episodes]);

  // Серии сезона из TMDB — когда сезон выбран
  useEffect(() => {
    if (s.episodes || loaded[s.number]) return;
    let alive = true;
    loadSeason(d.item, s.number)
      .then((eps) => alive && setLoaded((x) => ({ ...x, [s.number]: eps })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [season]);

  // Пока серии грузятся — заглушки, чтобы раскладка не прыгала
  const shown: Item[] =
    episodes ||
    Array.apply(null, Array(Math.min(s.episodeCount, 6))).map((_: unknown, i: number) => ({
      id: `${d.item.id}-wait-${s.number}-${i}`,
      title: `${i + 1}. …`,
      meta: '',
      colors: d.item.colors,
    }));

  return (
    <section ref={section} class="shelf shelf--episode" data-section>
      <div class="seasons__tabs" data-focus-group data-focus-remember>
        {d.seasons.map((x, i) => (
          <SeasonTab key={x.number} label={x.name} active={i === season} onPick={() => setSeason(i)} />
        ))}
      </div>
      <div class="shelf__viewport">
        {/* key — новая лента для каждого сезона, прокрутка начинается с начала */}
        <div class="shelf__track" data-scroll-x key={season + (episodes ? ':ok' : ':wait')}>
          {shown.map((ep) => (
            <Card key={ep.id} item={ep} kind="episode" onSelect={onSelect} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SeasonTab({ label, active, onPick }: { label: string; active: boolean; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.addEventListener('tvfocus', onPick);
    return () => el.removeEventListener('tvfocus', onPick);
  }, [onPick]);
  return (
    <button
      ref={ref}
      class={`season-tab${active ? ' is-active' : ''}${focusedClass(ref.current)}`}
      data-focusable
      onClick={onPick}
    >
      {label}
    </button>
  );
}
