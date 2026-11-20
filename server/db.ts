import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./crypto.ts";

export function openDatabase(file = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "chimerion.sqlite") : path.join(process.cwd(), "data", "chimerion.sqlite")) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 4000");
  initSchema(db);
  seedIfEmpty(db);
  return db;
}

export function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS studio (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      about TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      timezone TEXT NOT NULL,
      vk TEXT NOT NULL,
      telegram TEXT NOT NULL,
      maps_url TEXT NOT NULL,
      hours_label TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      specs_json TEXT NOT NULL,
      stations INTEGER NOT NULL,
      sort INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      zone_id TEXT NOT NULL,
      label TEXT NOT NULL,
      active INTEGER NOT NULL,
      sort INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      buffer_min INTEGER NOT NULL,
      rules_json TEXT NOT NULL,
      price_json TEXT NOT NULL,
      active INTEGER NOT NULL,
      sort INTEGER NOT NULL,
      source_note TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      guest_phone TEXT NOT NULL,
      guests INTEGER NOT NULL,
      comment TEXT NOT NULL,
      price_rub INTEGER,
      price_label TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS booking_resources (
      booking_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (booking_id, resource_id)
    );
    CREATE INDEX IF NOT EXISTS idx_br_resource ON booking_resources(resource_id, status, start_at, end_at);
    CREATE TABLE IF NOT EXISTS idempotency (
      key TEXT PRIMARY KEY,
      payload_hash TEXT NOT NULL,
      booking_id TEXT NOT NULL,
      token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gallery (
      id TEXT PRIMARY KEY,
      src TEXT NOT NULL,
      alt TEXT NOT NULL,
      caption TEXT NOT NULL,
      sort INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS promos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      condition TEXT NOT NULL,
      image TEXT,
      sort INTEGER NOT NULL,
      active INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      active INTEGER NOT NULL,
      sort INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function station(zone: string, index: number, label: string) {
  return { id: `${zone}-${index}`, zone_id: zone, label, active: 1, sort: index };
}

export function seedIfEmpty(db: DatabaseSync) {
  const existing = db.prepare("SELECT value FROM meta WHERE key = 'seed'").get() as { value: string } | undefined;
  if (existing) return;

  const insertZone = db.prepare(
    "INSERT INTO zones (id, title, summary, specs_json, stations, sort) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const zones = [
    ["standard", "Standard", "Общий зал. Тариф часа опубликован на Яндекс Картах.", JSON.stringify(["AMD Ryzen 5 7500F", "Palit GeForce RTX 5060 Dual", "16 ГБ DDR5 Patriot", "SSD Apacer 256 ГБ", "Machenike 25\" 300 Гц", "Кресло Cactus CS-CHR", "A4Tech Bloody S87", "Logitech G102", "HyperX Cloud III"]), 9, 1],
    ["standard_plus", "Standard+", "Те же ПК, монитор 27 дюймов 300 Гц. Отдельный почасовой тариф клуб в открытом прайсе не указал.", JSON.stringify(["AMD Ryzen 5 7500F", "Palit GeForce RTX 5060 Dual", "16 ГБ DDR5 Patriot", "SSD Apacer 256 ГБ", "Machenike 27\" 300 Гц", "Кресло Cactus CS-CHR", "A4Tech Bloody S87", "Logitech G102", "HyperX Cloud III"]), 7, 2],
    ["duo", "2×2", "Четыре станции для пары на пару. Процессор и видеокарта старше, чем в Standard.", JSON.stringify(["AMD Ryzen 5 9600X", "MSI GeForce RTX 5060 Ti", "16 ГБ DDR5 Patriot", "SSD Apacer 256 ГБ", "Machenike 27\" 300 Гц", "A4Tech Bloody S98", "Logitech G403 Hero", "Logitech G Pro X"]), 4, 3],
    ["solo", "Solo", "Одна отдельная станция с тем же железом, что у 2×2.", JSON.stringify(["AMD Ryzen 5 9600X", "MSI GeForce RTX 5060 Ti", "16 ГБ DDR5 Patriot", "SSD Apacer 256 ГБ", "Machenike 27\" 300 Гц", "A4Tech Bloody S98", "Logitech G403 Hero", "Logitech G Pro X"]), 1, 4],
    ["ps", "Зона PS", "Мягкие диваны и большой экран. В пакете дня рождения клуб указывает 2 зоны PS5.", JSON.stringify(["2 зоны PS5 в пакете «Двойная игра»", "Большой экран", "Диваны"]), 2, 5],
  ] as const;
  for (const zone of zones) insertZone.run(...zone);

  const insertResource = db.prepare("INSERT INTO resources (id, zone_id, label, active, sort) VALUES (?, ?, ?, ?, ?)");
  const resources = [
    ...Array.from({ length: 9 }, (_, i) => station("standard", i + 1, `Standard ${i + 1}`)),
    ...Array.from({ length: 7 }, (_, i) => station("standard_plus", i + 1, `Standard+ ${i + 1}`)),
    ...Array.from({ length: 4 }, (_, i) => station("duo", i + 1, `2×2 ${i + 1}`)),
    station("solo", 1, "Solo 1"),
    station("ps", 1, "PS 1"),
    station("ps", 2, "PS 2"),
  ];
  for (const resource of resources) insertResource.run(resource.id, resource.zone_id, resource.label, resource.active, resource.sort);

  const insertService = db.prepare(
    `INSERT INTO services (id, title, summary, duration_min, buffer_min, rules_json, price_json, active, sort, source_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const services: Array<[string, string, string, number, string, string, number, number, string]> = [
    [
      "std-1h",
      "1 час в зале Standard",
      "Одна станция Standard. Днём и ночью разный тариф.",
      60,
      JSON.stringify({ needs: [{ zone: "standard", count: 1 }], guests: "fixed", minGuests: 1, maxGuests: 1, startHours: null }),
      JSON.stringify({ type: "dayNight", dayRub: 130, nightRub: 150, dayFrom: 8, dayTo: 17 }),
      1,
      1,
      "Яндекс Карты: с 08:00 до 17:00 — 130 ₽, с 17:00 до 08:00 — 150 ₽.",
    ],
    [
      "std-3h",
      "3 часа в зале Standard",
      "Пакет на одну станцию. Старт только с 11:00 до 16:00.",
      180,
      JSON.stringify({ needs: [{ zone: "standard", count: 1 }], guests: "fixed", minGuests: 1, maxGuests: 1, startHours: [11, 12, 13, 14, 15, 16] }),
      JSON.stringify({ type: "weekdayWeekend", weekdayRub: 350, weekendRub: 410 }),
      1,
      2,
      "Яндекс Карты: с 11:00 до 16:00, будни 350 ₽, выходные 410 ₽.",
    ],
    [
      "std-5h",
      "5 часов в зале Standard",
      "Пакет на одну станцию. Старт только с 11:00 до 14:00.",
      300,
      JSON.stringify({ needs: [{ zone: "standard", count: 1 }], guests: "fixed", minGuests: 1, maxGuests: 1, startHours: [11, 12, 13, 14] }),
      JSON.stringify({ type: "weekdayWeekend", weekdayRub: 530, weekendRub: 620 }),
      1,
      3,
      "Яндекс Карты: с 11:00 до 14:00, будни 530 ₽, выходные 620 ₽.",
    ],
    [
      "std-10h",
      "10 часов в зале Standard",
      "Позиция есть в карточке клуба, сумма в открытом тексте не указана. Запись включится, когда владелец задаст цену.",
      600,
      JSON.stringify({ needs: [{ zone: "standard", count: 1 }], guests: "fixed", minGuests: 1, maxGuests: 1, startHours: null }),
      JSON.stringify({ type: "unpublished" }),
      0,
      4,
      "Яндекс Карты: «10 часов в зале Standard» без опубликованной суммы.",
    ],
    [
      "bday-big-3",
      "День рождения «Большая компания», 3 часа",
      "До 9 человек в зоне Standard. Цена за компанию, не за каждый ПК.",
      180,
      JSON.stringify({ needs: [{ zone: "standard", count: 1 }], guests: "multiplier", minGuests: 1, maxGuests: 9, startHours: null }),
      JSON.stringify({ type: "weekdayWeekend", weekdayRub: 3500, weekendRub: 4000 }),
      1,
      5,
      "Яндекс Карты: 3 часа — 3500 ₽ будни, 4000 ₽ выходные.",
    ],
    [
      "bday-big-5",
      "День рождения «Большая компания», 5 часов",
      "До 9 человек в зоне Standard. Цена за компанию.",
      300,
      JSON.stringify({ needs: [{ zone: "standard", count: 1 }], guests: "multiplier", minGuests: 1, maxGuests: 9, startHours: null }),
      JSON.stringify({ type: "weekdayWeekend", weekdayRub: 5200, weekendRub: 6100 }),
      1,
      6,
      "Яндекс Карты: 5 часов — 5200 ₽ будни, 6100 ₽ выходные.",
    ],
    [
      "bday-dual-3",
      "День рождения «Двойная игра», 3 часа",
      "4 ПК Standard и 2 зоны PS5. Клуб обещает бонус имениннику и время на сборы — состав бонуса в карточке не расписан.",
      180,
      JSON.stringify({ needs: [{ zone: "standard", count: 4 }, { zone: "ps", count: 2 }], guests: "fixed", minGuests: 1, maxGuests: 12, startHours: null }),
      JSON.stringify({ type: "weekdayWeekend", weekdayRub: 3500, weekendRub: 3900 }),
      1,
      7,
      "Яндекс Карты: 3 часа — 3500 ₽ будни, 3900 ₽ выходные.",
    ],
    [
      "bday-dual-5",
      "День рождения «Двойная игра», 5 часов",
      "4 ПК Standard и 2 зоны PS5.",
      300,
      JSON.stringify({ needs: [{ zone: "standard", count: 4 }, { zone: "ps", count: 2 }], guests: "fixed", minGuests: 1, maxGuests: 12, startHours: null }),
      JSON.stringify({ type: "weekdayWeekend", weekdayRub: 5100, weekendRub: 5900 }),
      1,
      8,
      "Яндекс Карты: 5 часов — 5100 ₽ будни, 5900 ₽ выходные.",
    ],
  ];
  for (const service of services) {
    insertService.run(service[0], service[1], service[2], service[3], 0, service[4], service[5], service[6], service[7], service[8]);
  }

  db.prepare(
    `INSERT INTO studio (id, name, tagline, about, phone, address, city, timezone, vk, telegram, maps_url, hours_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "chimerion",
    "Chimerion",
    "CYBER SPACE",
    "Ультрасовременный компьютерный клуб в Затоне. Клуб открылся 23 января 2026 года и работает круглосуточно. На станции Standard стоят Ryzen 5 7500F и GeForce RTX 5060, мониторы 300 Гц. Есть зона PS с диванами и большим экраном.",
    "+7 (993) 068-04-16",
    "Уфа, ул. Ахметова, 273",
    "Уфа",
    "Asia/Yekaterinburg",
    "https://vk.ru/chimerionufa",
    "https://t.me/chimerionufa",
    "https://yandex.ru/maps/org/chimerion/244740673632/",
    "Круглосуточно",
  );

  const insertGallery = db.prepare("INSERT INTO gallery (id, src, alt, caption, sort) VALUES (?, ?, ?, ?, ?)");
  const gallery = [
    ["hall", "/media/hero-a.jpg", "Зал Chimerion: ряд станций и открытые корпуса с оранжевой подсветкой", "Зал клуба. Кадр из Telegram @chimerionufa, 26 января 2026.", 1],
    ["rtx", "/media/hero-b.jpg", "Видеокарта GeForce RTX MSI внутри корпуса", "GeForce RTX, MSI. Модель на фото клуб не подписал; в карточке Standard указана Palit RTX 5060.", 2],
    ["ps", "/media/ps.jpg", "Оранжевая стена с вывеской CHIMERION CYBER SPACE и компания у большого экрана", "Зона PS. Вывеска клуба: CHIMERION CYBER SPACE.", 3],
    ["bar", "/media/menu.jpg", "Холодильник с напитками и полки с снеками", "Бар клуба. Цены на напитки в открытых источниках не публиковались.", 4],
    ["specs-a", "/media/hall-wide.jpg", "Карточка железа Standard и Standard+", "Железо Standard (9 ПК) и Standard+ (7 ПК). Карточка клуба от 23 января 2026.", 5],
    ["specs-b", "/media/specs-2.jpg", "Карточка железа 2х2 и Solo", "Железо 2×2 (4 ПК) и Solo (1 ПК). Карточка клуба от 23 января 2026.", 6],
    ["tv", "/media/ps-book.jpg", "Большой экран в зоне PS", "Экран зоны PS.", 7],
    ["logo", "/media/logo.jpg", "Логотип Chimerion: химера в оранжевом круге", "Знак клуба из Telegram.", 8],
  ];
  for (const item of gallery) insertGallery.run(...item);

  const insertPromo = db.prepare(
    "INSERT INTO promos (id, title, text, condition, image, sort, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
  );
  insertPromo.run(
    "night-energy",
    "Энергетик к ночному пакету",
    "При покупке пакета «Ночь» с понедельника по четверг клуб дарит энергетик. Стоимость самого пакета в посте не названа, поэтому онлайн-запись его не продаёт.",
    "До отмены акции. Энергетики не выдают лицам младше 18 лет. Чрезмерное употребление энергетиков может быть вредно для здоровья.",
    "/media/night.jpg",
    1,
  );
  insertPromo.run(
    "third-night",
    "Третья ночь по карточке",
    "Карточка со штампами: пройди путь и третья ночь бесплатно.",
    "Условие с карточки клуба, февраль 2026. Перед визитом лучше подтвердить, что акция ещё действует.",
    "/media/bonus-1.jpg",
    2,
  );
  insertPromo.run(
    "register-x2",
    "Первая регистрация ×2",
    "На графике клуба: баланс умножается на 2 при пополнении от 250 до 1000 ₽ на первой регистрации.",
    "Отдельный пост также пишет про ×2 за подписку и регистрацию, утреннее пополнение с 8 до 12 от 200 до 500 ₽ при трёх часах, 1000 бонусов на повторный визит и 200 бонусов за отзыв на Яндекс Картах или в 2ГИС. Бонусы начисляет клуб, онлайн-запись их не списывает.",
    "/media/bonus-2.jpg",
    3,
  );
  insertPromo.run(
    "birthday-note",
    "Именинникам",
    "В шапке Telegram клуб пишет: именинникам 3 часа бесплатно. На Яндекс Картах отдельно висят пакеты «Большая компания» и «Двойная игра» с ценой. Какая схема действует в конкретный день, подтверждает администратор.",
    "Оба текста опубликованы клубом. Запись на сайте считает тариф пакета с Карт и не обнуляет его сама.",
    null,
    4,
  );

  const insertReview = db.prepare("INSERT INTO reviews (id, author, text, source, active, sort) VALUES (?, ?, ?, ?, 1, ?)");
  insertReview.run("r1", "Никита Дементьев", "Отличный компьютерный клуб, цены приемлемые, железо замечательное, безумно выгодные акции, атмосфера, чистота, комфорт, все на высшем уровне, админы приветливые и всегда помогут.", "Яндекс Карты, 8 июля", 1);
  insertReview.run("r2", "Сигма", "Техническое оснащение на высшем уровне — мощные компьютеры, современные мониторы с высокой частотой обновления, удобные игровые кресла. Приятное освещение, хорошая звукоизоляция кабин. Персонал вежливый.", "Яндекс Карты, 21 февраля", 2);
  insertReview.run("r3", "KIRROSENE", "Довольно дешёвый прайс относительно других ПК-клубов. Классная периферия даже на стандарте, всегда чисто и даже кондиционер есть на стандартах.", "Яндекс Карты, 8 августа", 3);

  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASSWORD || "chimerion";
  db.prepare("INSERT INTO admin_users (id, username, password_hash) VALUES ('owner', ?, ?)").run(username, hashPassword(password));
  db.prepare("INSERT INTO meta (key, value) VALUES ('seed', '1')").run();
}
