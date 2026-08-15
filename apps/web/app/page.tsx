import Link from 'next/link';

const tools = [
  {
    label: 'Заметки',
    description: 'Сюжетные нити, имена и быстрые подсказки в одном месте.',
    mark: '01',
  },
  {
    label: 'Таймер',
    description: 'Общий ритм сцены на ноутбуке, телефоне и внешнем экране.',
    mark: '02',
  },
  {
    label: 'Кости',
    description: 'Честные броски и случайные таблицы без паузы в повествовании.',
    mark: '03',
  },
  {
    label: 'Бой',
    description: 'Инициатива, здоровье и состояния без привязки к одной системе.',
    mark: '04',
  },
];

export default function HomePage() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Fog of Lore — в начало">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>Fog of Lore</span>
        </a>
        <div className="landing-nav">
          <span className="nav-note">Self-hosted</span>
          <Link className="nav-secondary" href="/login">
            Войти
          </Link>
          <Link className="nav-primary" href="/register">
            Начать
          </Link>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Мастерская игровой сессии</p>
          <h1>
            Все нити истории.
            <br />
            <span>На вашей доске.</span>
          </h1>
          <p className="lede">
            Приватное self-hosted пространство для заметок, таймеров, бросков и боя. Спроектировано
            для реального стола — без лишнего шума между мастером и историей.
          </p>
          <p className="privacy-chip">
            <span aria-hidden="true">✦</span> Данные остаются на вашем сервере
          </p>
          <div className="actions">
            <Link className="nav-primary hero-primary" href="/register">
              Создать кампанию
            </Link>
            <a className="text-link" href="#foundation">
              Что уже готово
              <span aria-hidden="true"> ↓</span>
            </a>
          </div>
        </div>

        <aside className="session-card" aria-label="Пример будущей игровой доски">
          <div className="session-heading">
            <div>
              <p>Кампания</p>
              <h2>Пепельный предел</h2>
            </div>
            <span>Сессия 07</span>
          </div>
          <div className="scene-note">
            <p className="scene-kicker">Текущая сцена</p>
            <h3>Врата обсерватории</h3>
            <p>Колокол умолк. На снегу — следы, ведущие против ветра.</p>
          </div>
          <div className="session-meta">
            <div>
              <span>До рассвета</span>
              <strong>18:42</strong>
            </div>
            <div>
              <span>Ход</span>
              <strong>Илар</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="foundation" id="foundation" aria-labelledby="foundation-title">
        <div className="section-heading">
          <p className="eyebrow">Инструменты рядом, история впереди</p>
          <h2 id="foundation-title">Один спокойный центр управления</h2>
        </div>
        <div className="tool-grid">
          {tools.map((tool) => (
            <article className="tool-card" key={tool.mark}>
              <span>{tool.mark}</span>
              <h3>{tool.label}</h3>
              <p>{tool.description}</p>
            </article>
          ))}
        </div>
        <div className="architecture-note">
          <p>Сейчас</p>
          <strong>Безопасный вход и создание первой кампании</strong>
          <span>Учётные записи, сессии и доступ к данным проверяются на вашем сервере.</span>
        </div>
      </section>

      <footer>
        <span>Fog of Lore</span>
        <span>Ваш сервер · Ваши истории · Ваши данные</span>
      </footer>
    </main>
  );
}
