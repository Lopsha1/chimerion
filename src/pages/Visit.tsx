import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SiteFooter, SiteHeader } from "../components/Chrome";
import { MetalButton } from "../components/MetalButton";
import type { Booking, Slot } from "../types";

export function VisitPage() {
  const { token = "" } = useParams();
  const client = useQueryClient();
  const booking = useQuery({
    queryKey: ["visit", token],
    queryFn: async () => {
      const response = await fetch(`/api/visit/${token}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Запись не найдена");
      return body.booking as Booking;
    },
  });
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [message, setMessage] = useState("");

  const slots = useQuery({
    queryKey: ["visit-slots", booking.data?.serviceTitle, date],
    enabled: Boolean(date && booking.data && booking.data.status === "confirmed"),
    queryFn: async () => {
      const content = await fetch("/api/content").then((response) => response.json());
      const service = content.services.find((item: { title: string; id: string }) => item.title === booking.data?.serviceTitle);
      const response = await fetch(`/api/slots?serviceId=${service.id}&date=${date}&guests=${booking.data?.guests ?? 1}`);
      return (await response.json()) as { slots: Slot[] };
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/visit/${token}/cancel`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      return body.booking as Booking;
    },
    onSuccess: async () => {
      setMessage("Запись отменена, станции свободны.");
      await client.invalidateQueries({ queryKey: ["visit", token] });
    },
  });

  const move = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/visit/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: slot }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Перенос не выполнен");
      return body.booking as Booking;
    },
    onSuccess: async () => {
      setMessage("Время обновлено.");
      setSlot("");
      await client.invalidateQueries({ queryKey: ["visit", token] });
    },
    onError: (reason: Error) => setMessage(reason.message),
  });

  const data = booking.data;

  return (
    <>
      <SiteHeader />
      <main className="sheet">
        {booking.isLoading && <p>Открываем запись…</p>}
        {booking.isError && <p role="alert">{(booking.error as Error).message}</p>}
        {data && (
          <>
            <p className="eyebrow">{data.status === "confirmed" ? "Запись подтверждена" : "Запись отменена"}</p>
            <h1>{data.serviceTitle}</h1>
            <dl className="details">
              <div><dt>Когда</dt><dd>{data.localStart}–{data.localEnd}</dd></div>
              <div><dt>Имя</dt><dd>{data.guestName}</dd></div>
              <div><dt>Телефон</dt><dd>{data.guestPhone}</dd></div>
              <div><dt>Гостей</dt><dd>{data.guests}</dd></div>
              <div><dt>Станции</dt><dd>{data.resources.join(", ")}</dd></div>
              <div><dt>Сумма по тарифу</dt><dd>{data.priceRub === null ? data.priceLabel : `${data.priceRub} ₽`}</dd></div>
              <div><dt>Как посчитано</dt><dd>{data.priceLabel}</dd></div>
            </dl>
            <p className="source">Ссылка секретная: по ней видна только эта запись. Адрес клуба — ул. Ахметова, 273.</p>
            {message && <p role="status">{message}</p>}
            {data.status === "confirmed" && (
              <div className="manage">
                <h2>Перенести</h2>
                <label className="field">
                  Новый день
                  <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setSlot(""); }} />
                </label>
                <div className="slots">
                  {(slots.data?.slots ?? []).map((item) => (
                    <button key={item.start} type="button" className={slot === item.start ? "slot on" : "slot"} onClick={() => setSlot(item.start)}>
                      <b>{item.label}</b>
                      <span>{item.priceLabel}</span>
                    </button>
                  ))}
                </div>
                <MetalButton type="button" disabled={!slot} loading={move.isPending} onClick={() => move.mutate()}>
                  Перенести запись
                </MetalButton>
                <button type="button" className="text-danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                  Отменить запись
                </button>
              </div>
            )}
          </>
        )}
        <p><Link to="/">На главную</Link></p>
      </main>
      <SiteFooter />
    </>
  );
}
