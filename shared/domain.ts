import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";

export const TZ = "Asia/Yekaterinburg";

export type PriceRule =
  | {
      type: "dayNight";
      dayRub: number;
      nightRub: number;
      dayFrom: number;
      dayTo: number;
    }
  | { type: "weekdayWeekend"; weekdayRub: number; weekendRub: number }
  | { type: "unpublished" };

export type SeatNeed = { zone: string; count: number };

export type ServiceRules = {
  needs: SeatNeed[];
  guests: "fixed" | "multiplier";
  minGuests: number;
  maxGuests: number;
  /** Local hours when a session may start. Null means every hour. */
  startHours: number[] | null;
};

export type ServiceRecord = {
  id: string;
  title: string;
  summary: string;
  durationMin: number;
  bufferMin: number;
  rules: ServiceRules;
  price: PriceRule;
  active: boolean;
  sort: number;
  sourceNote: string;
};

export function pricePreview(rule: PriceRule): string {
  if (rule.type === "unpublished") return "Цена в открытых источниках не указана";
  if (rule.type === "dayNight") {
    return `${rule.dayRub} ₽ днём · ${rule.nightRub} ₽ ночью`;
  }
  return `${rule.weekdayRub} ₽ будни · ${rule.weekendRub} ₽ выходные`;
}

export function localParts(date: Date) {
  const hour = Number(formatInTimeZone(date, TZ, "H"));
  const minute = Number(formatInTimeZone(date, TZ, "m"));
  const isoDow = Number(formatInTimeZone(date, TZ, "i"));
  const dateKey = formatInTimeZone(date, TZ, "yyyy-MM-dd");
  return { hour, minute, isoDow, weekend: isoDow >= 6, dateKey };
}

export function priceAt(rule: PriceRule, start: Date): { rub: number | null; label: string } {
  if (rule.type === "unpublished") {
    return { rub: null, label: "Цену подтвердит администратор" };
  }
  const parts = localParts(start);
  if (rule.type === "dayNight") {
    const day = parts.hour >= rule.dayFrom && parts.hour < rule.dayTo;
    return day
      ? { rub: rule.dayRub, label: `${rule.dayRub} ₽ · день, ${pad(rule.dayFrom)}:00–${pad(rule.dayTo)}:00` }
      : { rub: rule.nightRub, label: `${rule.nightRub} ₽ · ночь, ${pad(rule.dayTo)}:00–${pad(rule.dayFrom)}:00` };
  }
  return parts.weekend
    ? { rub: rule.weekendRub, label: `${rule.weekendRub} ₽ · выходные` }
    : { rub: rule.weekdayRub, label: `${rule.weekdayRub} ₽ · будни` };
}

export function startAllowed(rules: ServiceRules, start: Date): boolean {
  const { hour, minute } = localParts(start);
  if (minute !== 0) return false;
  if (!rules.startHours) return true;
  return rules.startHours.includes(hour);
}

export function expandNeeds(rules: ServiceRules, guests: number): SeatNeed[] {
  const factor = rules.guests === "multiplier" ? guests : 1;
  return rules.needs.map((need) => ({ zone: need.zone, count: need.count * factor }));
}

export function allocate(
  resourcesByZone: Record<string, string[]>,
  busy: Set<string>,
  needs: SeatNeed[],
): string[] | null {
  const chosen: string[] = [];
  const used = new Set<string>();
  for (const need of needs) {
    const pool = (resourcesByZone[need.zone] ?? []).filter((id) => !busy.has(id) && !used.has(id));
    if (pool.length < need.count) return null;
    const take = pool.slice(0, need.count);
    for (const id of take) used.add(id);
    chosen.push(...take);
  }
  return chosen;
}

export function zonedStart(dateKey: string, hour: number): Date {
  return fromZonedTime(`${dateKey}T${pad(hour)}:00:00`, TZ);
}

export function formatLocal(date: Date, pattern = "d MMMM yyyy, HH:mm"): string {
  return formatInTimeZone(date, TZ, pattern, { locale: ru });
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
