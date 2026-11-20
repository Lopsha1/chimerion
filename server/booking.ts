import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  addMinutes,
  allocate,
  expandNeeds,
  formatLocal,
  localParts,
  priceAt,
  startAllowed,
  zonedStart,
  type PriceRule,
  type ServiceRecord,
  type ServiceRules,
} from "../shared/domain.ts";
import { newToken, sha256 } from "./crypto.ts";

export class BookingError extends Error {
  code: "conflict" | "invalid" | "idempotency_mismatch" | "not_found" | "closed";
  slots?: Slot[];
  constructor(code: BookingError["code"], message: string, slots?: Slot[]) {
    super(message);
    this.code = code;
    this.slots = slots;
  }
}

export type Slot = { start: string; label: string; priceRub: number | null; priceLabel: string };

type ServiceRow = {
  id: string;
  title: string;
  summary: string;
  duration_min: number;
  buffer_min: number;
  rules_json: string;
  price_json: string;
  active: number;
  sort: number;
  source_note: string;
};

export type BookingView = {
  id: string;
  serviceId: string;
  serviceTitle: string;
  start: string;
  end: string;
  localStart: string;
  localEnd: string;
  guestName: string;
  guestPhone?: string;
  guests: number;
  comment: string;
  priceRub: number | null;
  priceLabel: string;
  status: string;
  source: string;
  resources: string[];
  token?: string;
};

function mapService(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    durationMin: row.duration_min,
    bufferMin: row.buffer_min,
    rules: JSON.parse(row.rules_json) as ServiceRules,
    price: JSON.parse(row.price_json) as PriceRule,
    active: row.active === 1,
    sort: row.sort,
    sourceNote: row.source_note,
  };
}

export function listServices(db: DatabaseSync, onlyActive = true): ServiceRecord[] {
  const rows = db.prepare("SELECT * FROM services ORDER BY sort").all() as ServiceRow[];
  return rows.map(mapService).filter((service) => (onlyActive ? service.active && service.price.type !== "unpublished" : true));
}

export function getService(db: DatabaseSync, id: string): ServiceRecord | null {
  const row = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as ServiceRow | undefined;
  return row ? mapService(row) : null;
}

function resourcesByZone(db: DatabaseSync): Record<string, string[]> {
  const rows = db.prepare("SELECT id, zone_id FROM resources WHERE active = 1 ORDER BY sort").all() as Array<{ id: string; zone_id: string }>;
  const grouped: Record<string, string[]> = {};
  for (const row of rows) {
    grouped[row.zone_id] ??= [];
    grouped[row.zone_id].push(row.id);
  }
  return grouped;
}

function busySet(db: DatabaseSync, startIso: string, endIso: string, exceptBookingId?: string): Set<string> {
  const rows = db
    .prepare(
      `SELECT resource_id FROM booking_resources
       WHERE status = 'confirmed' AND start_at < ? AND end_at > ?
       ${exceptBookingId ? "AND booking_id != ?" : ""}`,
    )
    .all(...(exceptBookingId ? [endIso, startIso, exceptBookingId] : [endIso, startIso])) as Array<{ resource_id: string }>;
  return new Set(rows.map((row) => row.resource_id));
}

export function slotsFor(db: DatabaseSync, serviceId: string, dateKey: string, guests: number): Slot[] {
  const service = getService(db, serviceId);
  if (!service || !service.active || service.price.type === "unpublished") return [];
  if (guests < service.rules.minGuests || guests > service.rules.maxGuests) return [];
  const hours = service.rules.startHours ?? Array.from({ length: 24 }, (_, hour) => hour);
  const now = Date.now();
  const slots: Slot[] = [];
  for (const hour of hours) {
    const start = zonedStart(dateKey, hour);
    if (start.getTime() <= now) continue;
    if (!startAllowed(service.rules, start)) continue;
    const end = addMinutes(start, service.durationMin + service.bufferMin);
    const needs = expandNeeds(service.rules, guests);
    const chosen = allocate(resourcesByZone(db), busySet(db, start.toISOString(), end.toISOString()), needs);
    if (!chosen) continue;
    const price = priceAt(service.price, start);
    slots.push({
      start: start.toISOString(),
      label: formatLocal(start, "HH:mm"),
      priceRub: price.rub,
      priceLabel: price.label,
    });
  }
  return slots;
}

export type CreateInput = {
  serviceId: string;
  start: string;
  name: string;
  phone: string;
  guests: number;
  comment: string;
  idempotencyKey: string;
  source: "site" | "owner";
};

function canonical(input: CreateInput): string {
  return JSON.stringify({
    serviceId: input.serviceId,
    start: new Date(input.start).toISOString(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    guests: input.guests,
    comment: input.comment.trim(),
    source: input.source,
  });
}

export function createBooking(db: DatabaseSync, input: CreateInput): BookingView {
  const payloadHash = sha256(canonical(input));
  const token = newToken();
  const tokenHash = sha256(token);
  let bookingId = "";

  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT payload_hash, booking_id, token FROM idempotency WHERE key = ?").get(input.idempotencyKey) as
      | { payload_hash: string; booking_id: string; token: string }
      | undefined;
    if (existing) {
      db.exec("COMMIT");
      if (existing.payload_hash !== payloadHash) {
        throw new BookingError("idempotency_mismatch", "Этот ключ уже использован для другой записи");
      }
      const view = readBooking(db, existing.booking_id, true);
      if (!view) throw new BookingError("not_found", "Запись не найдена");
      view.token = existing.token;
      return view;
    }

    const service = getService(db, input.serviceId);
    if (!service || (!service.active && input.source !== "owner") || service.price.type === "unpublished") {
      throw new BookingError("closed", "Эта услуга сейчас не записывается онлайн");
    }
    const start = new Date(input.start);
    if (Number.isNaN(start.getTime())) throw new BookingError("invalid", "Некорректное время");
    if (input.source === "site" && start.getTime() <= Date.now()) throw new BookingError("invalid", "Это время уже прошло");
    if (input.source === "site" && !startAllowed(service.rules, start)) {
      throw new BookingError("invalid", "В этот час пакет не стартует");
    }
    if (input.guests < service.rules.minGuests || input.guests > service.rules.maxGuests) {
      throw new BookingError("invalid", "Число гостей не подходит этой услуге");
    }
    const end = addMinutes(start, service.durationMin + service.bufferMin);
    const needs = expandNeeds(service.rules, input.guests);
    const chosen = allocate(resourcesByZone(db), busySet(db, start.toISOString(), end.toISOString()), needs);
    if (!chosen) throw new BookingError("conflict", "Это время только что заняли");

    const price = priceAt(service.price, start);
    bookingId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO bookings (id, service_id, start_at, end_at, guest_name, guest_phone, guests, comment, price_rub, price_label, status, source, token_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
    ).run(
      bookingId,
      service.id,
      start.toISOString(),
      end.toISOString(),
      input.name.trim(),
      input.phone.trim(),
      input.guests,
      input.comment.trim(),
      price.rub,
      price.label,
      input.source,
      tokenHash,
      now,
    );
    const insertResource = db.prepare(
      "INSERT INTO booking_resources (booking_id, resource_id, start_at, end_at, status) VALUES (?, ?, ?, ?, 'confirmed')",
    );
    for (const resourceId of chosen) insertResource.run(bookingId, resourceId, start.toISOString(), end.toISOString());
    db.prepare("INSERT INTO idempotency (key, payload_hash, booking_id, token, created_at) VALUES (?, ?, ?, ?, ?)").run(
      input.idempotencyKey,
      payloadHash,
      bookingId,
      token,
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }

  const view = readBooking(db, bookingId, true);
  if (!view) throw new BookingError("not_found", "Запись не сохранилась");
  view.token = token;
  return view;
}

export function readBooking(db: DatabaseSync, id: string, withPhone: boolean): BookingView | null {
  const row = db
    .prepare(
      `SELECT b.*, s.title AS service_title FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.id = ?`,
    )
    .get(id) as
    | {
        id: string;
        service_id: string;
        service_title: string;
        start_at: string;
        end_at: string;
        guest_name: string;
        guest_phone: string;
        guests: number;
        comment: string;
        price_rub: number | null;
        price_label: string;
        status: string;
        source: string;
      }
    | undefined;
  if (!row) return null;
  const resources = db
    .prepare(
      `SELECT r.label FROM booking_resources br JOIN resources r ON r.id = br.resource_id
       WHERE br.booking_id = ? ORDER BY r.sort`,
    )
    .all(id) as Array<{ label: string }>;
  const start = new Date(row.start_at);
  const end = new Date(row.end_at);
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceTitle: row.service_title,
    start: row.start_at,
    end: row.end_at,
    localStart: formatLocal(start),
    localEnd: formatLocal(end, "HH:mm"),
    guestName: row.guest_name,
    guestPhone: withPhone ? row.guest_phone : undefined,
    guests: row.guests,
    comment: row.comment,
    priceRub: row.price_rub,
    priceLabel: row.price_label,
    status: row.status,
    source: row.source,
    resources: resources.map((resource) => resource.label),
  };
}

export function bookingByToken(db: DatabaseSync, token: string): BookingView | null {
  const row = db.prepare("SELECT id FROM bookings WHERE token_hash = ?").get(sha256(token)) as { id: string } | undefined;
  if (!row) return null;
  return readBooking(db, row.id, true);
}

export function cancelBooking(db: DatabaseSync, id: string) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT status FROM bookings WHERE id = ?").get(id) as { status: string } | undefined;
    if (!row) throw new BookingError("not_found", "Запись не найдена");
    if (row.status === "cancelled") {
      db.exec("COMMIT");
      return;
    }
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id);
    db.prepare("UPDATE booking_resources SET status = 'cancelled' WHERE booking_id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}

export function rescheduleBooking(db: DatabaseSync, id: string, startIso: string, actor: "guest" | "owner") {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as
      | { id: string; service_id: string; guests: number; status: string }
      | undefined;
    if (!row || row.status !== "confirmed") throw new BookingError("not_found", "Активная запись не найдена");
    const service = getService(db, row.service_id);
    if (!service) throw new BookingError("invalid", "Услуга исчезла");
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) throw new BookingError("invalid", "Некорректное время");
    if (actor === "guest" && (start.getTime() <= Date.now() || !startAllowed(service.rules, start))) {
      throw new BookingError("invalid", "Это время нельзя выбрать");
    }
    const end = addMinutes(start, service.durationMin + service.bufferMin);
    db.prepare("UPDATE booking_resources SET status = 'cancelled' WHERE booking_id = ?").run(id);
    const needs = expandNeeds(service.rules, row.guests);
    const chosen = allocate(resourcesByZone(db), busySet(db, start.toISOString(), end.toISOString(), id), needs);
    if (!chosen) throw new BookingError("conflict", "На это время свободных станций нет");
    const price = priceAt(service.price, start);
    db.prepare("UPDATE bookings SET start_at = ?, end_at = ?, price_rub = ?, price_label = ? WHERE id = ?").run(
      start.toISOString(),
      end.toISOString(),
      price.rub,
      price.label,
      id,
    );
    db.prepare("DELETE FROM booking_resources WHERE booking_id = ?").run(id);
    const insertResource = db.prepare(
      "INSERT INTO booking_resources (booking_id, resource_id, start_at, end_at, status) VALUES (?, ?, ?, ?, 'confirmed')",
    );
    for (const resourceId of chosen) insertResource.run(id, resourceId, start.toISOString(), end.toISOString());
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}

export function dayBookings(db: DatabaseSync, dateKey: string): BookingView[] {
  const start = zonedStart(dateKey, 0).toISOString();
  const end = zonedStart(dateKey, 23);
  const endIso = addMinutes(end, 60).toISOString();
  const rows = db
    .prepare(
      `SELECT id FROM bookings WHERE status = 'confirmed' AND start_at < ? AND end_at > ? ORDER BY start_at`,
    )
    .all(endIso, start) as Array<{ id: string }>;
  return rows.map((row) => readBooking(db, row.id, true)!).filter(Boolean);
}

export function localHourLabel(dateIso: string): string {
  return `${localParts(new Date(dateIso)).hour}`;
}
