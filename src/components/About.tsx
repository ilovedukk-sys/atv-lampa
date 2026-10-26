/**
 * Нижние разделы экрана фильма, как в Apple TV:
 *   «Описание»   — ряд карточек: о фильме, слоган, оценки TMDB и Кинопоиска, бюджет и сборы;
 *   «Знаете ли вы, что…» — факты с Кинопоиска (если он включён);
 *   «Информация» / «Языки» / «Создатели» — три панели с подробностями.
 * Всё фокусируется пультом, «ОК» открывает карточку или панель целиком.
 */
import type { ComponentChildren } from "preact";
import type { Details, DetailsInfo } from "../data/details";
import { formatNumber, kpRows, score, type Kp } from "../api/kinopoisk";

/** Что показать в окне по «ОК»: заголовок и строки «название — значение». */
export interface MoreContent {
  title: string;
  text?: string;
  rows: [string, string][];
}

interface Props {
  d: Details;
  onMore: (content: MoreContent | "desc") => void;
}

export function AboutSection({ d, kp, onMore }: Props & { kp: Kp | null }) {
  const info = d.info;
  if (!info) return null;
  const money = moneyRows(info, kp);
  const tagline =
    info.tagline && `«${info.tagline.replace(/^[«"„“]+|[»"“”]+$/g, "")}»`; // у TMDB бывает уже в кавычках
  return (
    <section class="shelf about" data-section>
      <h2 class="shelf__title">Описание</h2>
      {/* Карточек бывает больше, чем помещается (с Кинопоиском) — ряд листается, как полка */}
      <div class="shelf__viewport">
        <div class="shelf__track about__row" data-scroll-x>
          <Card cls="about__card--main" onClick={() => onMore("desc")}>
            <div class="about__title">{d.item.title}</div>
            <div class="about__sub">{d.genres.join(", ")}</div>
            <p class="about__text">
              {d.description || "Описание отсутствует."}
            </p>
            <More />
          </Card>
          {tagline && (
            <Card
              cls="about__card--quote"
              onClick={() =>
                onMore({ title: "Слоган", text: tagline, rows: [] })
              }
            >
              <div class="about__label">Слоган</div>
              <p class="about__quote">{tagline}</p>
            </Card>
          )}
          {info.score !== undefined && (
            <Card
              cls="about__card--score"
              onClick={() =>
                onMore({
                  title: "Оценка зрителей",
                  rows: [
                    [
                      "Оценка TMDB",
                      `${(info.score! / 10).toFixed(1).replace(".", ",")} из 10`,
                    ],
                    ["Голосов", formatNumber(info.votes || 0)],
                  ],
                })
              }
            >
              <div class="about__score">
                {info.score}
                <small>%</small>
              </div>
              <div class={`about__source${info.score >= 60 ? " is-good" : ""}`}>
                TMDB
              </div>
              <div class="about__stats">
                <span>Голосов</span>
                <b>{formatNumber(info.votes || 0)}</b>
                <span>Оценка</span>
                <b>{(info.score / 10).toFixed(1).replace(".", ",")}/10</b>
              </div>
            </Card>
          )}
          {kp && kp.kp && (
            <Card
              cls="about__card--score"
              onClick={() =>
                onMore({ title: "Оценки Кинопоиска", rows: kpRows(kp) })
              }
            >
              <div class="about__score">{score(kp.kp.value)}</div>
              <div class={`about__source about__source--kp`}>КИНОПОИСК</div>
              <div class="about__stats">
                {kp.kp.votes && <span>Голосов</span>}
                {kp.kp.votes && <b>{formatNumber(kp.kp.votes)}</b>}
                {kp.imdb && <span>IMDb</span>}
                {kp.imdb && <b>{score(kp.imdb.value)}</b>}
                {kp.critics && <span>Критики</span>}
                {kp.critics && <b>{score(kp.critics.value)}</b>}
              </div>
            </Card>
          )}
          {money.length > 0 && (
            <Card
              cls="about__card--money"
              onClick={() => onMore({ title: "Бюджет и сборы", rows: money })}
            >
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
      </div>
    </section>
  );
}

/** «Знаете ли вы, что…» — факты с Кинопоиска: ряд карточек, «ОК» — факт целиком. */
export function FactsSection({
  facts,
  onMore,
}: {
  facts: string[];
  onMore: Props["onMore"];
}) {
  return (
    <section class="shelf about about--facts" data-section>
      <h2 class="shelf__title">Знаете ли вы, что…</h2>
      <div class="shelf__viewport">
        <div class="shelf__track" data-scroll-x>
          {facts.map((f, i) => (
            <Card
              key={i}
              cls="about__card--fact"
              onClick={() =>
                onMore({ title: "Знаете ли вы, что…", text: f, rows: [] })
              }
            >
              <p class="about__fact">{f}</p>
              <More />
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export function InfoSection({ d, onMore }: Props) {
  const info = d.info;
  if (!info) return null;
  const show = d.kind === "show";

  const general = rows([
    [show ? "Телеканал" : "Студия", info.studios.join(", ")],
    [show ? "Годы" : "Релиз", info.released],
    ["Статус", info.status],
    [
      show ? "Сезоны" : "Длительность",
      show && info.episodes
        ? `${d.runtime}, ${info.episodes} серий`
        : d.runtime,
    ],
    ["Возраст", d.age],
    [
      info.countries.length > 1 ? "Страны" : "Страна",
      info.countries.join(", "),
    ],
  ]);
  const langs = rows([
    ["Исходный язык", info.originalLanguage],
    ["Оригинальное название", info.originalTitle],
    ["Языки в фильме", info.languages.join(", ")],
  ]);
  const people = rows([
    [
      show ? "Создатели" : info.directors.length > 1 ? "Режиссёры" : "Режиссёр",
      info.directors.join(", "),
    ],
    ["Сценарий", info.writers.join(", ")],
    ["Продюсеры", info.producers.join(", ")],
    ["Композитор", info.music.join(", ")],
  ]);

  const cols: [string, [string, string][]][] = [
    ["Информация", general],
    ["Языки", langs],
    ["Создатели", people],
  ];

  return (
    <section class="infocols" data-section>
      {cols
        .filter(([, r]) => r.length > 0)
        .map(([title, r]) => (
          <div class="infocol" key={title}>
            <h2 class="infocol__title">{title}</h2>
            <div
              class="infocol__panel"
              data-focusable
              onClick={() => onMore({ title, rows: r })}
            >
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

function Card({
  cls,
  onClick,
  children,
}: {
  cls: string;
  onClick: () => void;
  children: ComponentChildren;
}) {
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

/** Бюджет и сборы из TMDB; чего там нет — с Кинопоиска, плюс сборы в России. */
function moneyRows(info: DetailsInfo, kp: Kp | null) {
  const m = kp ? kp.money : {};
  return rows([
    ["Бюджет", info.budget || m.BUDGET],
    ["Сборы в мире", info.revenue || m.WORLD],
    ["Сборы в России", m.RUS],
  ]);
}
