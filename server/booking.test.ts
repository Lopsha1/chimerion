import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { addMinutes, allocate, priceAt, zonedStart } from "../shared/domain.ts";
import { createBooking, rescheduleBooking, slotsFor } from "./booking.ts";
import { initSchema, seedIfEmpty } from "./db.ts";

function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "chimerion-"));
  const db = new DatabaseSync(path.join(dir, "test.sqlite"));
  db.exec("PRAGMA foreign_keys = ON");
  initSchema(db);
  seedIfEmpty(db);
  return db;
}

describe("тариф Standard", () => {
  it("днём 130, ночью 150, в том числе после полуночи", () => {
    const rule = { type: "dayNight" as const, dayRub: 130, nightRub: 150, dayFrom: 8, dayTo: 17 };
    expect(priceAt(rule, zonedStart("2026-11-18", 10)).rub).toBe(130);
    expect(priceAt(rule, zonedStart("2026-11-18", 17)).rub).toBe(150);
    expect(priceAt(rule, zonedStart("2026-11-18", 2)).rub).toBe(150);
    expect(priceAt(rule, zonedStart("2026-11-18", 7)).rub).toBe(150);
  });

  it("пакет 3 часа различает будни и выходные", () => {
    const rule = { type: "weekdayWeekend" as const, weekdayRub: 350, weekendRub: 410 };
    expect(priceAt(rule, zonedStart("2026-11-18", 12)).label).toContain("будни");
    expect(priceAt(rule, zonedStart("2026-11-21", 12)).rub).toBe(410);
  });
});

describe("запись", () => {
  it("занимает станцию, повтор с тем же ключом возвращает ту же запись, другой состав отвергает", () => {
    const db = freshDb();
    const start = futureHour(11);
    const first = createBooking(db, input(start, "key-1"));
    const again = createBooking(db, input(start, "key-1"));
    expect(again.id).toBe(first.id);
    expect(again.token).toBe(first.token);
    expect(() => createBooking(db, { ...input(start, "key-1"), phone: "+79990000000" })).toThrow(/другой записи/);
  });

  it("две записи на последнюю станцию: вторая получает конфликт", () => {
    const db = freshDb();
    db.prepare("UPDATE resources SET active = 0 WHERE zone_id = 'standard' AND id != 'standard-1'").run();
    const start = futureHour(12);
    createBooking(db, input(start, "a"));
    expect(() => createBooking(db, input(start, "b", "Второй"))).toThrow(/заняли/);
    const next = addMinutes(new Date(start), 60).toISOString();
    const moved = createBooking(db, input(next, "c"));
    expect(moved.id).not.toBe("");
  });

  it("трёхчасовая запись с 22:00 держит станцию после полуночи и отпускает в 01:00", () => {
    const db = freshDb();
    db.prepare("UPDATE resources SET active = 0 WHERE zone_id = 'standard' AND id != 'standard-1'").run();
    const late = futureHour(22);
    createBooking(db, { ...input(late, "night"), serviceId: "bday-big-3", guests: 1 });
    const nextKey = dateKeyOf(addMinutes(new Date(late), 120).toISOString());
    const slots = slotsFor(db, "std-1h", nextKey, 1);
    expect(slots.some((slot) => slot.label === "00:00")).toBe(false);
    expect(slots.some((slot) => slot.label === "01:00")).toBe(true);
  });

  it("перенос освобождает старый час и занимает новый", () => {
    const db = freshDb();
    db.prepare("UPDATE resources SET active = 0 WHERE zone_id = 'standard' AND id != 'standard-1'").run();
    const start = futureHour(11);
    const booking = createBooking(db, input(start, "move"));
    const target = futureHour(15);
    rescheduleBooking(db, booking.id, target, "guest");
    expect(slotsFor(db, "std-1h", dateKeyOf(start), 1).some((slot) => slot.start === start)).toBe(true);
    expect(slotsFor(db, "std-1h", dateKeyOf(target), 1).some((slot) => slot.start === target)).toBe(false);
  });

  it("компания на 9 станций забирает весь Standard", () => {
    const db = freshDb();
    const start = futureHour(18);
    const booking = createBooking(db, {
      ...input(start, "party"),
      serviceId: "bday-big-3",
      guests: 9,
    });
    expect(booking.resources).toHaveLength(9);
    expect(slotsFor(db, "std-1h", dateKeyOf(start), 1).some((slot) => slot.start === start)).toBe(false);
  });
});

describe("раскладка станций", () => {
  it("не выдаёт зону, которой не хватает", () => {
    const chosen = allocate({ standard: ["a", "b"], ps: ["p"] }, new Set(), [
      { zone: "standard", count: 4 },
      { zone: "ps", count: 2 },
    ]);
    expect(chosen).toBeNull();
  });
});

function input(start: string, key: string, name = "Илья") {
  return {
    serviceId: "std-1h",
    start,
    name,
    phone: "+79930680416",
    guests: 1,
    comment: "",
    idempotencyKey: key,
    source: "site" as const,
  };
}

function futureHour(hour: number): string {
  const now = new Date();
  for (let day = 1; day < 10; day += 1) {
    const probe = new Date(now.getTime() + day * 86_400_000);
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yekaterinburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(probe);
    const start = zonedStart(dateKey, hour);
    if (start.getTime() > Date.now() + 60_000) return start.toISOString();
  }
  throw new Error("не нашли будущий час");
}

function dateKeyOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yekaterinburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
