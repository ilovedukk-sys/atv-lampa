/**
 * Нижние разделы экрана фильма, как в Apple TV:
 *   «Описание»   — ряд карточек: о фильме, слоган, оценка зрителей, бюджет и сборы;
 *   «Информация» / «Языки» / «Создатели» — три панели с подробностями.
 * Всё фокусируется пультом, «ОК» открывает карточку или панель целиком.
 */
import type { ComponentChildren } from 'preact';
import type { Details, DetailsInfo } from '../data/details';

/** Что показать в окне по «ОК»: заголовок и строки «название — значение». */
export interface MoreContent {
  title: string;
  text?: string;
  rows: [string, string][];
}

interface Props {
  d: Details;
  onMore: (content: MoreContent | 'desc') => void;
}

export function AboutSection({ d, onMore }: Props) {
  const info = d.info;
  if (!info) return null;
  const money = moneyRows(info);
  return (
    <section class="shelf about" data-section>
      <h2 class="shelf__title">Описание</h2>
      <div class="about__row" data-focus-group>
        <Card cls="about__card--main" onClick={() => onMore('desc')}>
          <div class="about__title">{d.item.title}</div>
          <div class="about__sub">{d.genres.join(', ')}</div>
          <p class="about__text">{d.description}</p>
          <More />
        </Card>
        {info.tagline && (
          <Card cls="about__card--quote" onClick={() => onMore({ title: 'Слоган', text: `«${info.tagline}»`, rows: [] })}>
            <div class="about__label">Слоган</div>
            <p class="about__quote">«{info.tagline}»</p>
          </Card>
        )}
        {info.score !== undefined && (
          <Card
            cls="about__card--score"
            onClick={() =>
              onMore({
                title: 'Оценка зрителей',
                rows: [
                  ['Оценка TMDB', `${(info.score! / 10).toFixed(1).replace('.', ',')} из 10`],
                  ['Голосов', formatNumber(info.votes || 0)],
                ],
              })
            }
          >
            <div class="about__score">
              {info.score}
              <small>%</small>
            </div>
            <div class={`about__source${info.score >= 60 ? ' is-good' : ''}`}>TMDB</div>
            <div class="about__stats">
              <span>Голосов</span>
              <b>{formatNumber(info.votes || 0)}</b>
              <span>Оценка</span>
              <b>{(info.score / 10).toFixed(1).replace('.', ',')}/10</b>
            </div>
          </Card>
        )}
        {money.length > 0 && (
          <Card cls="about__card--money" onClick={() => onMore({ title: 'Бюджет и сборы', rows: money })}>
            <div class="about__label">Бюджет и сборы</div>
            {money.map(([k, v]) => (
              <div class="about__money" key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </Card>
        )}
      </div>
    </section>
  );
}

export function InfoSection({ d, onMore }: Props) {
  const info = d.info;
  if (!info) return null;
  const show = d.kind === 'show';

  const general = rows([
    [show ? 'Телеканал' : 'Студия', info.studios.join(', ')],
    [show ? 'Годы' : 'Релиз', info.released],
    ['Статус', info.status],
    [show ? 'Сезоны' : 'Длительность', show && info.episodes ? `${d.runtime}, ${info.episodes} серий` : d.runtime],
    ['Возраст', d.age],
    [info.countries.length > 1 ? 'Страны' : 'Страна', info.countries.join(', ')],
  ]);
  const langs = rows([
    ['Исходный язык', info.originalLanguage],
    ['Оригинальное название', info.originalTitle],
    ['Языки в фильме', info.languages.join(', ')],
  ]);
  const people = rows([
    [show ? 'Создатели' : info.directors.length > 1 ? 'Режиссёры' : 'Режиссёр', info.directors.join(', ')],
    ['Сценарий', info.writers.join(', ')],
    ['Продюсеры', info.producers.join(', ')],
    ['Композитор', info.music.join(', ')],
  ]);

  const cols: [string, [string, string][]][] = [
    ['Информация', general],
    ['Языки', langs],
    ['Создатели', people],
  ];

  return (
    <section class="infocols" data-section>
      {cols
        .filter(([, r]) => r.length > 0)
        .map(([title, r]) => (
          <div class="infocol" key={title}>
            <h2 class="infocol__title">{title}</h2>
            <div class="infocol__panel" data-focusable onClick={() => onMore({ title, rows: r })}>
              <div class="infocol__body">
                {r.map(([k, v]) => (
                  <div class="infocol__row" key={k}>
                    <div class="infocol__key">{k}</div>
                    <div class="infocol__value">{v}</div>
                  </div>
                ))}
              </div>
              <More />
            </div>
          </div>
        ))}
    </section>
  );
}

function Card({ cls, onClick, children }: { cls: string; onClick: () => void; children: ComponentChildren }) {
  return (
    <div class={`about__card ${cls}`} data-focusable onClick={onClick}>
      {children}
    </div>
  );
}

const More = () => <div class="about__more">ЕЩЁ</div>;

function rows(list: [string, string | undefined][]): [string, string][] {
  return list.filter((x): x is [string, string] => !!x[1]);
}

function moneyRows(info: DetailsInfo) {
  return rows([
    ['Бюджет', info.budget],
    ['Сборы', info.revenue],
  ]);
}

/** 12345 → «12 345». */
function formatNumber(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
