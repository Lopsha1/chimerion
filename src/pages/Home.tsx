import { MapPin, Phone } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { MetalButton } from "../components/MetalButton";
import { PageShell, useContent } from "../components/Page";

export function HomePage() {
  const content = useContent();
  const prices = (content.data?.services ?? []).filter((service) => service.bookable).slice(0, 4);

  return (
    <PageShell className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Уфа · Затон · открыто 24/7</p>
          <h1>Садись и играй. Станция от 130 ₽.</h1>
          <p className="lede">
            Chimerion на Ахметова, 273. Standard на Ryzen 5 7500F и RTX 5060, мониторы 300 Гц. Час можно занять заранее, пока его не взяли.
          </p>
          <div className="hero-actions">
            <Link to="/book"><MetalButton>Записаться</MetalButton></Link>
            <a className="quiet" href="tel:+79930680416"><Phone size={18} /> +7 (993) 068-04-16</a>
          </div>
          <ul className="hero-points">
            <li>День 130 ₽ · ночь 150 ₽</li>
            <li>9 станций Standard</li>
            <li>Зона PS с большим экраном</li>
          </ul>
        </div>
        <figure className="hero-frame">
          <img src="/media/hero-a.jpg" alt="Зал Chimerion: ряд игровых станций" />
        </figure>
      </section>

      <section className="section">
        <div className="section-head row-head">
          <div>
            <p className="eyebrow">Тарифы</p>
            <h2>Сколько стоит сесть</h2>
          </div>
          <Link to="/prices">Все тарифы</Link>
        </div>
        {content.isError && <p className="banner">Цены не загрузились. Обновите страницу.</p>}
        <div className="price-grid">
          {prices.map((service) => (
            <article key={service.id} className="price-card">
              <h3>{service.title}</h3>
              <p className="price">{service.pricePreview}</p>
              <Link to={`/book?service=${service.id}`}>Выбрать время</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="book-band">
        <div>
          <p className="eyebrow">Запись</p>
          <h2>Три шага до станции</h2>
          <ol>
            <li>Тариф</li>
            <li>Свободный час</li>
            <li>Имя и телефон</li>
          </ol>
        </div>
        <Link to="/book"><MetalButton>Записаться</MetalButton></Link>
      </section>

      <section className="section address-band">
        <div>
          <p className="eyebrow">Адрес</p>
          <h2>Уфа, ул. Ахметова, 273</h2>
          <p className="lede">Затон, Ленинский район. Ориентир — улица Пожарского, около 100 метров. Время клуба — Екатеринбург, UTC+5.</p>
          <p className="visit-links">
            <a href="tel:+79930680416"><Phone size={18} /> +7 (993) 068-04-16</a>
            <Link to="/contacts"><MapPin size={18} /> Как добраться</Link>
          </p>
        </div>
        <iframe title="Chimerion на карте" src="https://yandex.ru/map-widget/v1/?ll=55.887054%2C54.782299&z=16&pt=55.887054,54.782299,pm2orgl" />
      </section>
    </PageShell>
  );
}
