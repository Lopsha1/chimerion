import { Link } from "react-router-dom";
import { PageIntro, PageShell, useContent } from "../components/Page";

export function PricesPage() {
  const content = useContent();
  return (
    <PageShell>
      <PageIntro
        kicker="Тарифы"
        title="Прайс, который клуб опубликовал"
        text="Суммы с Яндекс Карт. Ночной пакет и час в Standard+, 2×2 и Solo в открытом прайсе не указаны, поэтому здесь их нет. Акции бонусами запись не пересчитывает."
      />
      <div className="price-grid">
        {(content.data?.services ?? []).map((service) => (
          <article key={service.id} className="price-card">
            <h2>{service.title}</h2>
            <p className="price">{service.pricePreview}</p>
            <p>{service.summary}</p>
            <p className="source">{service.sourceNote}</p>
            {service.bookable ? <Link to={`/book?service=${service.id}`}>Выбрать время</Link> : <span className="locked">Онлайн-запись выключена, пока нет цены</span>}
          </article>
        ))}
      </div>
    </PageShell>
  );
}
