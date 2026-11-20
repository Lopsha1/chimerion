import { Link } from "react-router-dom";
import { PageIntro, PageShell, useContent } from "../components/Page";

export function ZonesPage() {
  const content = useContent();
  return (
    <PageShell>
      <PageIntro
        kicker="Зоны"
        title="Где сесть"
        text="Состав железа — с карточек клуба от 23 января 2026. Почасовой тариф опубликован только для Standard. Остальные зоны можно посмотреть здесь, а записать онлайн — станцию с ценой."
      />
      <div className="zone-grid">
        {(content.data?.zones ?? []).map((zone) => (
          <article key={zone.id} className="zone-card">
            <header>
              <h2>{zone.title}</h2>
              <span>{zone.stations} мест</span>
            </header>
            <p>{zone.summary}</p>
            <ul>
              {zone.specs.map((spec) => <li key={spec}>{spec}</li>)}
            </ul>
          </article>
        ))}
      </div>
      <div className="spec-photos">
        <figure className="fit-shot">
          <img src="/media/hall-wide.jpg" alt="Карточка железа Standard и Standard+" />
        </figure>
        <figure className="fit-shot">
          <img src="/media/specs-2.jpg" alt="Карточка железа 2×2 и Solo" />
        </figure>
      </div>
      <p className="next-link"><Link to="/book">Записаться на Standard</Link></p>
    </PageShell>
  );
}
