import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { MetalButton } from "../components/MetalButton";
import type { Booking, Content, ServiceView } from "../types";

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yekaterinburg" }).format(new Date());
}

export function AdminPage() {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: async () => {
      const response = await fetch("/api/admin/session");
      return (await response.json()) as { ok: boolean };
    },
  });
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const login = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Вход не выполнен");
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-session"] }),
    onError: (reason: Error) => setLoginError(reason.message),
  });

  if (!session.data?.ok) {
    return (
      <main className="sheet narrow-sheet">
        <p className="eyebrow">Кабинет владельца</p>
        <h1>Вход</h1>
        <p className="source">Локальная база на этом компьютере. Гостевой пароль из инструкции запуска, его нужно сменить перед настоящей сменой.</p>
        <form
          className="book-form"
          onSubmit={(event) => {
            event.preventDefault();
            setLoginError("");
            login.mutate();
          }}
        >
          <label className="field">Логин<input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label className="field">Пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {loginError && <p role="alert">{loginError}</p>}
          <MetalButton type="submit" loading={login.isPending}>Войти</MetalButton>
        </form>
        <p><Link to="/">На сайт</Link></p>
      </main>
    );
  }

  return <Desk />;
}

function Desk() {
  const client = useQueryClient();
  const [date, setDate] = useState(todayKey());
  const day = useQuery({
    queryKey: ["admin-day", date],
    queryFn: async () => {
      const response = await fetch(`/api/admin/day?date=${date}`);
      if (response.status === 401) throw new Error("Сессия истекла");
      return (await response.json()) as { bookings: Booking[]; services: ServiceView[] };
    },
  });
  const content = useQuery({
    queryKey: ["content"],
    queryFn: async () => (await fetch("/api/content")).json() as Promise<Content>,
  });
  const resources = useQuery({
    queryKey: ["resources"],
    queryFn: async () => (await fetch("/api/admin/resources")).json() as Promise<{ resources: Array<{ id: string; label: string; active: number; zone_id: string }> }>,
  });

  const [manual, setManual] = useState({ serviceId: "std-1h", start: "", name: "", phone: "", guests: 1, comment: "" });
  const [note, setNote] = useState("");

  async function refresh() {
    await client.invalidateQueries({ queryKey: ["admin-day", date] });
    await client.invalidateQueries({ queryKey: ["content"] });
  }

  return (
    <main className="sheet">
      <p className="eyebrow">Кабинет · SQLite на этом компьютере, не облако</p>
      <h1>Смена Chimerion</h1>
      <button
        className="text-danger"
        type="button"
        onClick={async () => {
          await fetch("/api/admin/logout", { method: "POST" });
          await client.invalidateQueries({ queryKey: ["admin-session"] });
        }}
      >
        Выйти
      </button>

      <section>
        <h2>Записи дня</h2>
        <label className="field">Дата<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <ul className="admin-list">
          {(day.data?.bookings ?? []).map((booking) => (
            <li key={booking.id}>
              <strong>{booking.localStart}</strong> · {booking.serviceTitle} · {booking.guestName} · {booking.guestPhone}
              <span> · {booking.resources.join(", ")} · {booking.priceLabel}</span>
              <button type="button" onClick={async () => { await fetch(`/api/admin/bookings/${booking.id}/cancel`, { method: "POST" }); await refresh(); }}>Отменить</button>
            </li>
          ))}
        </ul>
        {day.data && day.data.bookings.length === 0 && <p>На этот день подтверждённых записей нет.</p>}
      </section>

      <section>
        <h2>Ручная запись</h2>
        <form
          className="book-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setNote("");
            const response = await fetch("/api/admin/bookings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...manual, guests: Number(manual.guests), idempotencyKey: crypto.randomUUID(), start: new Date(manual.start).toISOString() }),
            });
            const body = await response.json();
            setNote(response.ok ? `Запись создана: ${body.booking.localStart}` : body.error);
            if (response.ok) await refresh();
          }}
        >
          <label className="field">Услуга
            <select value={manual.serviceId} onChange={(event) => setManual({ ...manual, serviceId: event.target.value })}>
              {(content.data?.services ?? []).filter((service) => service.bookable).map((service) => (
                <option key={service.id} value={service.id}>{service.title}</option>
              ))}
            </select>
          </label>
          <label className="field">Начало<input type="datetime-local" value={manual.start} onChange={(event) => setManual({ ...manual, start: event.target.value })} required /></label>
          <label className="field">Имя<input value={manual.name} onChange={(event) => setManual({ ...manual, name: event.target.value })} required /></label>
          <label className="field">Телефон<input value={manual.phone} onChange={(event) => setManual({ ...manual, phone: event.target.value })} required /></label>
          <label className="field">Гостей<input type="number" min={1} max={12} value={manual.guests} onChange={(event) => setManual({ ...manual, guests: Number(event.target.value) })} /></label>
          {note && <p role="status">{note}</p>}
          <MetalButton type="submit">Поставить в сетку</MetalButton>
        </form>
      </section>

      <section>
        <h2>Станции</h2>
        <ul className="admin-list">
          {(resources.data?.resources ?? []).map((resource) => (
            <li key={resource.id}>
              <label>
                <input
                  type="checkbox"
                  checked={resource.active === 1}
                  onChange={async (event) => {
                    await fetch(`/api/admin/resources/${resource.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ active: event.target.checked }),
                    });
                    await client.invalidateQueries({ queryKey: ["resources"] });
                  }}
                />
                {resource.label}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <ServiceEditor services={content.data?.services ?? []} onSaved={refresh} />
      <GalleryEditor items={content.data?.gallery ?? []} onSaved={refresh} />
      {content.data && <StudioEditor studio={content.data.studio} onSaved={refresh} />}
      <p><Link to="/">Открыть сайт</Link></p>
    </main>
  );
}

function ServiceEditor({ services, onSaved }: { services: ServiceView[]; onSaved: () => Promise<void> }) {
  return (
    <section>
      <h2>Услуги и цены</h2>
      {services.map((service) => (
        <ServiceRow key={service.id} service={service} onSaved={onSaved} />
      ))}
    </section>
  );
}

function ServiceRow({ service, onSaved }: { service: ServiceView; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(service.title);
  const [summary, setSummary] = useState(service.summary);
  const [active, setActive] = useState(service.active);
  const [durationMin, setDurationMin] = useState(service.durationMin);
  const [priceType, setPriceType] = useState(service.price.type);
  const [a, setA] = useState(service.price.dayRub ?? service.price.weekdayRub ?? 0);
  const [b, setB] = useState(service.price.nightRub ?? service.price.weekendRub ?? 0);
  const [hours, setHours] = useState(service.rules.startHours ? service.rules.startHours.join(",") : "");
  const [sourceNote, setSourceNote] = useState(service.sourceNote);
  const [status, setStatus] = useState("");

  return (
    <form
      className="admin-card"
      onSubmit={async (event) => {
        event.preventDefault();
        const startHours = hours.trim() ? hours.split(",").map((item) => Number(item.trim())) : null;
        const price = priceType === "dayNight"
          ? { type: "dayNight", dayRub: Number(a), nightRub: Number(b), dayFrom: service.price.dayFrom ?? 8, dayTo: service.price.dayTo ?? 17 }
          : priceType === "weekdayWeekend"
            ? { type: "weekdayWeekend", weekdayRub: Number(a), weekendRub: Number(b) }
            : { type: "unpublished" };
        const response = await fetch(`/api/admin/services/${service.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, summary, durationMin: Number(durationMin), active, price, startHours, sourceNote }),
        });
        setStatus(response.ok ? "Сохранено" : "Не сохранилось");
        if (response.ok) await onSaved();
      }}
    >
      <label className="field">Название<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field">Описание<textarea value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
      <label className="field">Минуты<input type="number" value={durationMin} onChange={(event) => setDurationMin(Number(event.target.value))} /></label>
      <label className="field">Тип цены
        <select value={priceType} onChange={(event) => setPriceType(event.target.value)}>
          <option value="dayNight">День / ночь</option>
          <option value="weekdayWeekend">Будни / выходные</option>
          <option value="unpublished">Цена не задана</option>
        </select>
      </label>
      {priceType !== "unpublished" && (
        <>
          <label className="field">{priceType === "dayNight" ? "День, ₽" : "Будни, ₽"}<input type="number" value={a} onChange={(event) => setA(Number(event.target.value))} /></label>
          <label className="field">{priceType === "dayNight" ? "Ночь, ₽" : "Выходные, ₽"}<input type="number" value={b} onChange={(event) => setB(Number(event.target.value))} /></label>
        </>
      )}
      <label className="field">Часы старта через запятую, пусто — все<input value={hours} onChange={(event) => setHours(event.target.value)} /></label>
      <label className="field">Откуда цена<textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} /></label>
      <label><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Принимать запись</label>
      <button type="submit">Сохранить услугу</button>
      {status && <span>{status}</span>}
    </form>
  );
}

function GalleryEditor({ items, onSaved }: { items: Content["gallery"]; onSaved: () => Promise<void> }) {
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  return (
    <section>
      <h2>Галерея</h2>
      <ul className="admin-list">
        {items.map((item, index) => (
          <li key={item.id}>
            <img src={item.src} alt="" width={96} height={64} />
            <input
              value={captionDrafts[item.id] ?? item.caption}
              onChange={(event) => setCaptionDrafts({ ...captionDrafts, [item.id]: event.target.value })}
            />
            <button
              type="button"
              onClick={async () => {
                await fetch(`/api/admin/gallery/${item.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ alt: item.alt, caption: captionDrafts[item.id] ?? item.caption }),
                });
                await onSaved();
              }}
            >
              Подпись
            </button>
            <button
              type="button"
              onClick={async () => {
                const ids = items.map((entry) => entry.id);
                if (index === 0) return;
                [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                await fetch("/api/admin/gallery/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
                await onSaved();
              }}
            >
              Выше
            </button>
            <label className="file">
              Заменить
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const dataUrl = await readFile(file);
                  await fetch(`/api/admin/gallery/${item.id}/replace`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dataUrl }),
                  });
                  await onSaved();
                }}
              />
            </label>
            <button type="button" onClick={async () => { await fetch(`/api/admin/gallery/${item.id}`, { method: "DELETE" }); await onSaved(); }}>Удалить</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StudioEditor({ studio, onSaved }: { studio: Content["studio"]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    tagline: studio.tagline,
    about: studio.about,
    phone: studio.phone,
    address: studio.address,
    vk: studio.vk,
    telegram: studio.telegram,
    hoursLabel: studio.hours_label,
  });
  return (
    <section>
      <h2>Контакты</h2>
      <form
        className="book-form"
        onSubmit={async (event) => {
          event.preventDefault();
          await fetch("/api/admin/studio", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
          await onSaved();
        }}
      >
        {(["tagline", "phone", "address", "vk", "telegram", "hoursLabel"] as const).map((key) => (
          <label className="field" key={key}>{key}<input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>
        ))}
        <label className="field">О клубе<textarea value={form.about} onChange={(event) => setForm({ ...form, about: event.target.value })} /></label>
        <button type="submit">Сохранить контакты</button>
      </form>
    </section>
  );
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
