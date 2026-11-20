import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { pricePreview, type PriceRule, type ServiceRules } from "../shared/domain.ts";
import {
  BookingError,
  bookingByToken,
  cancelBooking,
  createBooking,
  dayBookings,
  getService,
  listServices,
  rescheduleBooking,
  slotsFor,
} from "./booking.ts";
import { newToken, sha256, verifyPassword } from "./crypto.ts";
import { openDatabase } from "./db.ts";

const db = openDatabase();
const app = express();
app.use(express.json({ limit: "6mb" }));

const publicDir = path.join(process.cwd(), "public");
const distDir = path.join(process.cwd(), "dist");
app.use("/media", express.static(path.join(publicDir, "media")));

function sendError(res: Response, error: unknown) {
  if (error instanceof BookingError) {
    const status = error.code === "conflict" ? 409 : error.code === "not_found" ? 404 : error.code === "idempotency_mismatch" ? 409 : 400;
    res.status(status).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Проверьте поля формы", details: error.flatten() });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Сервер не смог завершить операцию" });
}

function cookieToken(req: Request): string | null {
  const header = req.header("cookie") ?? "";
  const pair = header.split(";").map((part) => part.trim()).find((part) => part.startsWith("chimerion_session="));
  return pair ? decodeURIComponent(pair.slice("chimerion_session=".length)) : null;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = cookieToken(req);
  if (!token) {
    res.status(401).json({ error: "Нужен вход владельца" });
    return;
  }
  const session = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").get(sha256(token)) as
    | { user_id: string; expires_at: string }
    | undefined;
  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    res.status(401).json({ error: "Сессия истекла" });
    return;
  }
  next();
}

function contentPayload() {
  const studio = db.prepare("SELECT * FROM studio WHERE id = 'chimerion'").get();
  const zones = db.prepare("SELECT * FROM zones ORDER BY sort").all() as Array<{ specs_json: string }>;
  const services = listServices(db, false).map((service) => ({
    ...service,
    pricePreview: pricePreview(service.price),
    bookable: service.active && service.price.type !== "unpublished",
  }));
  const gallery = db.prepare("SELECT * FROM gallery ORDER BY sort").all();
  const promos = db.prepare("SELECT * FROM promos WHERE active = 1 ORDER BY sort").all();
  const reviews = db.prepare("SELECT id, author, text, source FROM reviews WHERE active = 1 ORDER BY sort").all();
  return {
    studio,
    zones: zones.map((zone) => ({ ...zone, specs: JSON.parse(zone.specs_json) })),
    services,
    gallery,
    promos,
    reviews,
    demo: false,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, store: "sqlite", timezone: "Asia/Yekaterinburg" });
});

app.get("/api/content", (_req, res) => {
  res.json(contentPayload());
});

app.get("/api/slots", (req, res) => {
  try {
    const query = z
      .object({
        serviceId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        guests: z.coerce.number().int().min(1).max(12).default(1),
      })
      .parse(req.query);
    res.json({ slots: slotsFor(db, query.serviceId, query.date, query.guests) });
  } catch (error) {
    sendError(res, error);
  }
});

const bookingBody = z.object({
  serviceId: z.string().min(1),
  start: z.string().min(10),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(10).max(20),
  guests: z.number().int().min(1).max(12).default(1),
  comment: z.string().trim().max(500).default(""),
  idempotencyKey: z.string().min(8).max(80),
});

app.post("/api/bookings", (req, res) => {
  try {
    const body = bookingBody.parse(req.body);
    const booking = createBooking(db, { ...body, source: "site" });
    res.status(201).json({ booking });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/visit/:token", (req, res) => {
  const booking = bookingByToken(db, req.params.token);
  if (!booking) {
    res.status(404).json({ error: "Ссылка на запись не подходит" });
    return;
  }
  res.json({ booking });
});

app.post("/api/visit/:token/cancel", (req, res) => {
  try {
    const booking = bookingByToken(db, req.params.token);
    if (!booking) throw new BookingError("not_found", "Ссылка на запись не подходит");
    cancelBooking(db, booking.id);
    res.json({ booking: bookingByToken(db, req.params.token) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/visit/:token/reschedule", (req, res) => {
  try {
    const body = z.object({ start: z.string().min(10) }).parse(req.body);
    const booking = bookingByToken(db, req.params.token);
    if (!booking) throw new BookingError("not_found", "Ссылка на запись не подходит");
    rescheduleBooking(db, booking.id, body.start, "guest");
    res.json({ booking: bookingByToken(db, req.params.token) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/admin/login", (req, res) => {
  const body = z.object({ username: z.string(), password: z.string() }).parse(req.body);
  const user = db.prepare("SELECT id, password_hash FROM admin_users WHERE username = ?").get(body.username) as
    | { id: string; password_hash: string }
    | undefined;
  if (!user || !verifyPassword(body.password, user.password_hash)) {
    res.status(401).json({ error: "Неверный логин или пароль" });
    return;
  }
  const token = newToken();
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), user.id, expires);
  res.setHeader("Set-Cookie", `chimerion_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const token = cookieToken(req);
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(sha256(token));
  res.setHeader("Set-Cookie", "chimerion_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  const token = cookieToken(req);
  if (!token) {
    res.json({ ok: false });
    return;
  }
  const session = db.prepare("SELECT expires_at FROM sessions WHERE token = ?").get(sha256(token)) as { expires_at: string } | undefined;
  res.json({ ok: Boolean(session && new Date(session.expires_at).getTime() > Date.now()) });
});

app.get("/api/admin/day", requireAdmin, (req, res) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
  res.json({ bookings: dayBookings(db, date), services: listServices(db, false) });
});

app.post("/api/admin/bookings", requireAdmin, (req, res) => {
  try {
    const body = bookingBody.parse(req.body);
    const booking = createBooking(db, { ...body, source: "owner" });
    res.status(201).json({ booking });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/admin/bookings/:id/cancel", requireAdmin, (req, res) => {
  try {
    cancelBooking(db, req.params.id);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/admin/bookings/:id/reschedule", requireAdmin, (req, res) => {
  try {
    const body = z.object({ start: z.string() }).parse(req.body);
    rescheduleBooking(db, req.params.id, body.start, "owner");
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

const priceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("dayNight"), dayRub: z.number().int().nonnegative(), nightRub: z.number().int().nonnegative(), dayFrom: z.number().int().min(0).max(23), dayTo: z.number().int().min(1).max(24) }),
  z.object({ type: z.literal("weekdayWeekend"), weekdayRub: z.number().int().nonnegative(), weekendRub: z.number().int().nonnegative() }),
  z.object({ type: z.literal("unpublished") }),
]);

app.patch("/api/admin/services/:id", requireAdmin, (req, res) => {
  const service = getService(db, req.params.id);
  if (!service) {
    res.status(404).json({ error: "Услуга не найдена" });
    return;
  }
  const body = z
    .object({
      title: z.string().min(2),
      summary: z.string().min(2),
      durationMin: z.number().int().min(30).max(24 * 60),
      active: z.boolean(),
      price: priceSchema,
      startHours: z.array(z.number().int().min(0).max(23)).nullable(),
      sourceNote: z.string(),
    })
    .parse(req.body);
  const rules: ServiceRules = { ...service.rules, startHours: body.startHours };
  db.prepare(
    `UPDATE services SET title = ?, summary = ?, duration_min = ?, rules_json = ?, price_json = ?, active = ?, source_note = ? WHERE id = ?`,
  ).run(body.title, body.summary, body.durationMin, JSON.stringify(rules), JSON.stringify(body.price satisfies PriceRule), body.active ? 1 : 0, body.sourceNote, service.id);
  res.json({ service: getService(db, service.id) });
});

app.patch("/api/admin/studio", requireAdmin, (req, res) => {
  const body = z
    .object({
      tagline: z.string().min(1),
      about: z.string().min(1),
      phone: z.string().min(5),
      address: z.string().min(5),
      vk: z.string().url(),
      telegram: z.string().url(),
      hoursLabel: z.string().min(1),
    })
    .parse(req.body);
  db.prepare(
    `UPDATE studio SET tagline = ?, about = ?, phone = ?, address = ?, vk = ?, telegram = ?, hours_label = ? WHERE id = 'chimerion'`,
  ).run(body.tagline, body.about, body.phone, body.address, body.vk, body.telegram, body.hoursLabel);
  res.json({ studio: db.prepare("SELECT * FROM studio WHERE id = 'chimerion'").get() });
});

app.get("/api/admin/resources", requireAdmin, (_req, res) => {
  res.json({ resources: db.prepare("SELECT * FROM resources ORDER BY zone_id, sort").all() });
});

app.patch("/api/admin/resources/:id", requireAdmin, (req, res) => {
  const body = z.object({ active: z.boolean() }).parse(req.body);
  db.prepare("UPDATE resources SET active = ? WHERE id = ?").run(body.active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.patch("/api/admin/promos/:id", requireAdmin, (req, res) => {
  const body = z.object({ title: z.string(), text: z.string(), condition: z.string(), active: z.boolean() }).parse(req.body);
  db.prepare("UPDATE promos SET title = ?, text = ?, condition = ?, active = ? WHERE id = ?").run(body.title, body.text, body.condition, body.active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.patch("/api/admin/gallery/:id", requireAdmin, (req, res) => {
  const body = z.object({ alt: z.string().min(1), caption: z.string() }).parse(req.body);
  db.prepare("UPDATE gallery SET alt = ?, caption = ? WHERE id = ?").run(body.alt, body.caption, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/gallery/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM gallery WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/admin/gallery/order", requireAdmin, (req, res) => {
  const body = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
  const update = db.prepare("UPDATE gallery SET sort = ? WHERE id = ?");
  db.exec("BEGIN IMMEDIATE");
  try {
    body.ids.forEach((id, index) => update.run(index + 1, id));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json({ ok: true });
});

app.post("/api/admin/gallery", requireAdmin, (req, res) => {
  try {
    const body = z.object({ alt: z.string().min(1), caption: z.string(), dataUrl: z.string().min(20) }).parse(req.body);
    const saved = saveImage(body.dataUrl);
    const id = randomUUID();
    const sortRow = db.prepare("SELECT COALESCE(MAX(sort), 0) AS sort FROM gallery").get() as { sort: number };
    db.prepare("INSERT INTO gallery (id, src, alt, caption, sort) VALUES (?, ?, ?, ?, ?)").run(id, saved, body.alt, body.caption, sortRow.sort + 1);
    res.status(201).json({ id, src: saved });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/admin/gallery/:id/replace", requireAdmin, (req, res) => {
  try {
    const body = z.object({ dataUrl: z.string().min(20) }).parse(req.body);
    const current = db.prepare("SELECT id FROM gallery WHERE id = ?").get(req.params.id);
    if (!current) {
      res.status(404).json({ error: "Кадр не найден" });
      return;
    }
    const saved = saveImage(body.dataUrl);
    db.prepare("UPDATE gallery SET src = ? WHERE id = ?").run(saved, req.params.id);
    res.json({ src: saved });
  } catch (error) {
    sendError(res, error);
  }
});

function saveImage(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new BookingError("invalid", "Нужен файл JPEG, PNG или WebP");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 4_500_000) throw new BookingError("invalid", "Файл больше 4,5 МБ");
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const name = `${randomUUID()}.${ext}`;
  const folder = path.join(publicDir, "media", "uploads");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, name), buffer);
  return `/media/uploads/${name}`;
}

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Нет такого метода" });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
if (process.env.CHIMERION_NO_LISTEN !== "1") {
  app.listen(port, host, () => {
    console.log(`Chimerion API http://${host}:${port}`);
  });
}

export { app };
