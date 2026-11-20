import { PageIntro, PageShell, useContent } from "../components/Page";

export function HallPage() {
  const content = useContent();
  const shots = (content.data?.gallery ?? []).filter((item) => item.id !== "logo" && !item.id.startsWith("specs"));
  return (
    <PageShell>
      <PageIntro
        kicker="Зал"
        title="Как это выглядит"
        text="Кадры из открытого Telegram клуба."
      />
      <div className="gallery">
        {shots.map((item) => (
          <figure key={item.id}>
            <img src={item.src} alt={item.alt} />
          </figure>
        ))}
      </div>
    </PageShell>
  );
}
