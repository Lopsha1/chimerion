import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SiteFooter, SiteHeader } from "../components/Chrome";
import { MetalButton } from "../components/MetalButton";
import { loadContent } from "../components/Page";
import type { Booking, Slot } from "../types";

function dateKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let index = 0; index < count; index += 1) {
    const date = new Date(now.getTime() + index * 86_400_000);
    keys.push(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yekaterinburg" }).format(date));
  }
  return keys;
}

function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" }).format(date);
}

export function BookPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const content = useQuery({ queryKey: ["content"], queryFn: loadContent });
  const services = (content.data?.services ?? []).filter((service) => service.bookable);
  const initial = params.get("service");
  const [serviceId, setServiceId] = useState(initial ?? "");
  const chosen = services.find((service) => service.id === serviceId) ?? services[0];
  const activeId = chosen?.id ?? "";
  const [guests, setGuests] = useState(1);
  const days = useMemo(() => dateKeys(14), []);
  const [date, setDate] = useState(days[0]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());

  const guestCount = chosen?.rules.guests === "multiplier" ? guests : 1;
  const slots = useQuery({
    queryKey: ["slots", activeId, date, guestCount],
    enabled: Boolean(activeId),
    queryFn: async () => {
      const response = await fetch(`/api/slots?serviceId=${activeId}&date=${date}&guests=${guestCount}`);
      if (!response.ok) throw new Error("slots");
      return (await response.json()) as { slots: Slot[] };
    },
  });

  const booking = useMutation({
    mutationFn: async () => {
      if (!slot || !chosen) throw new Error("Выберите время");
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: chosen.id,
          start: slot.start,
          name,
          phone,
          guests: guestCount,
          comment,
          idempotencyKey: key,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) await slots.refetch();
        throw new Error(body.error || "Запись не создана");
      }
      return body.booking as Booking;
    },
    onSuccess: (result) => {
      if (!result.token) return;
      navigate(`/visit/${result.token}`);
    },
    onError: (reason: Error) => setError(reason.message),
  });

  return (
    <>
      <SiteHeader />
      <main className="sheet" id="main">
        <p className="eyebrow">Запись без регистрации</p>
        <h1>Занять станцию</h1>
        <p className="lede narrow">Свободные часы приходят с сервера. Цена на кнопке уже посчитана по тарифу этого часа.</p>

        <ol className="steps">
          <li>
            <h2>Тариф</h2>
            <div className="choice-grid">
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  className={service.id === activeId ? "choice on" : "choice"}
                  onClick={() => {
                    setServiceId(service.id);
                    setSlot(null);
                    setGuests(service.rules.minGuests);
                  }}
                >
                  <strong>{service.title}</strong>
                  <span>{service.pricePreview}</span>
                </button>
              ))}
            </div>
            {chosen?.rules.guests === "multiplier" && (
              <label className="field">
                Сколько человек, до {chosen.rules.maxGuests}
                <input
                  type="number"
                  min={chosen.rules.minGuests}
                  max={chosen.rules.maxGuests}
                  value={guests}
                  onChange={(event) => {
                    setGuests(Number(event.target.value));
                    setSlot(null);
                  }}
                />
              </label>
            )}
          </li>
          <li>
            <h2>День</h2>
            <div className="days">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={day === date ? "day on" : "day"}
                  onClick={() => {
                    setDate(day);
                    setSlot(null);
                  }}
                >
                  {dayLabel(day)}
                </button>
              ))}
            </div>
            <h2>Время</h2>
            {slots.isFetching && <p>Смотрим свободные станции…</p>}
            {slots.isError && <p className="banner">Свободные часы здесь не открылись. Позвоните в клуб: <a href="tel:+79930680416">+7 (993) 068-04-16</a></p>}
            <div className="slots">
              {(slots.data?.slots ?? []).map((item) => (
                <button
                  key={item.start}
                  type="button"
                  className={slot?.start === item.start ? "slot on" : "slot"}
                  onClick={() => setSlot(item)}
                >
                  <b>{item.label}</b>
                  <span>{item.priceLabel}</span>
                </button>
              ))}
            </div>
            {slots.data && slots.data.slots.length === 0 && !slots.isFetching && <p>В этот день свободных станций под выбранный тариф нет.</p>}
          </li>
          <li>
            <h2>Контакты</h2>
            <form
              className="book-form"
              onSubmit={(event) => {
                event.preventDefault();
                setError("");
                booking.mutate();
              }}
            >
              <label className="field">
                Имя
                <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} autoComplete="name" />
              </label>
              <label className="field">
                Телефон
                <input value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={10} autoComplete="tel" inputMode="tel" />
              </label>
              <label className="field">
                Комментарий
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} />
              </label>
              {error && <p role="alert" className="alert">{error}</p>}
              <MetalButton type="submit" loading={booking.isPending} disabled={!slot || name.trim().length < 2 || phone.trim().length < 10}>
                Записаться
              </MetalButton>
              <p className="source">Оплата на месте или так, как договоритесь с администратором. Сайт не снимает деньги.</p>
            </form>
          </li>
        </ol>
        <p><Link to="/">На главную</Link></p>
      </main>
      <SiteFooter />
    </>
  );
}
