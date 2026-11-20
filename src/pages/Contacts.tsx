import { PageIntro, PageShell, useContent } from "../components/Page";

export function ContactsPage() {
  const content = useContent();
  const studio = content.data?.studio;
  return (
    <PageShell>
      <PageIntro
        kicker="Контакты"
        title={studio?.address ?? "Уфа, ул. Ахметова, 273"}
        text="Круглосуточно. Затон, Ленинский район. До улицы Пожарского около 100 метров."
      />
      <div className="visit">
        <div>
          <p><a href="tel:+79930680416">{studio?.phone ?? "+7 (993) 068-04-16"}</a></p>
          <p className="visit-links">
            <a href={studio?.telegram ?? "https://t.me/chimerionufa"}>Telegram</a>
            <a href={studio?.vk ?? "https://vk.ru/chimerionufa"}>ВКонтакте</a>
            <a href="https://yandex.ru/maps/org/chimerion/244740673632/">Яндекс Карты</a>
          </p>
          <ul className="facts-list">
            <li>Оплата наличными, картой, по QR и СБП.</li>
            <li>Парковка, онлайн-игры, аренда аккаунта, предварительная запись.</li>
            <li>С животными нельзя. Вход на инвалидной коляске клуб отмечает как недоступный.</li>
          </ul>
        </div>
        <iframe title="Chimerion на карте" src="https://yandex.ru/map-widget/v1/?ll=55.887054%2C54.782299&z=17&pt=55.887054,54.782299,pm2orgl" />
      </div>
      <section className="section tight">
        <h2>Отзывы с Яндекс Карт</h2>
        <div className="reviews">
          {(content.data?.reviews ?? []).map((review) => (
            <blockquote key={review.id}>
              <p>{review.text}</p>
              <footer>{review.author} · {review.source}</footer>
            </blockquote>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
