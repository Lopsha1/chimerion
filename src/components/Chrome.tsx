import { NavLink, Link } from "react-router-dom";

const links = [
  ["/", "Главная"],
  ["/zones", "Зоны"],
  ["/prices", "Тарифы"],
  ["/hall", "Зал"],
  ["/offers", "Акции"],
  ["/contacts", "Контакты"],
] as const;

export function SiteHeader() {
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <img src="/media/logo.jpg" alt="" width={42} height={42} />
        <span>
          Chimerion
          <small>Киберклуб · Уфа</small>
        </span>
      </Link>
      <nav>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>
            {label}
          </NavLink>
        ))}
        <NavLink to="/book" className="nav-cta">Записаться</NavLink>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div>
        <strong>Chimerion</strong>
        <p>Уфа, ул. Ахметова, 273. Круглосуточно.</p>
      </div>
      <nav>
        {links.slice(1).map(([to, label]) => (
          <Link key={to} to={to}>{label}</Link>
        ))}
      </nav>
      <div>
        <a href="tel:+79930680416">+7 (993) 068-04-16</a>
        <a href="https://t.me/chimerionufa">Telegram</a>
        <a href="https://vk.ru/chimerionufa">ВКонтакте</a>
      </div>
    </footer>
  );
}
