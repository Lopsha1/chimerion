import { Link } from "react-router-dom";
import { PageIntro, PageShell, useContent } from "../components/Page";

export function OffersPage() {
  const content = useContent();
  return (
    <PageShell>
      <PageIntro
        kicker="Акции"
        title="Бонусы клуба"
        text="Тексты из Telegram @chimerionufa. Онлайн-запись считает опубликованный тариф и сама бонус не списывает."
      />
      <div className="promo-grid">
        {(content.data?.promos ?? []).map((promo, index) => (
          <article key={promo.id} className="promo-card" style={{ animationDelay: `${index * 80}ms` }}>
            {promo.image && <img src={promo.image} alt="" />}
            <div>
              <h2>{promo.title}</h2>
              <p>{promo.text}</p>
              <p className="source">{promo.condition}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="next-link"><Link to="/book">Записаться по тарифу</Link></p>
    </PageShell>
  );
}
