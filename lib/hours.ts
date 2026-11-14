import type { ScheduleSpan } from "./db/schema";

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, sundays: 0, domingo: 0,
  mon: 1, monday: 1, mondays: 1, lunes: 1,
  tue: 2, tues: 2, tuesday: 2, tuesdays: 2, martes: 2,
  wed: 3, weds: 3, wednesday: 3, wednesdays: 3, miercoles: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4, jueves: 4,
  fri: 5, friday: 5, fridays: 5, viernes: 5,
  sat: 6, saturday: 6, saturdays: 6, sabado: 6,
};
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY = "(?:sun(?:day)?s?|mon(?:day)?s?|tue(?:s(?:day)?)?s?|wed(?:s|nesday)?s?|thu(?:r(?:s(?:day)?)?)?s?|fri(?:day)?s?|sat(?:urday)?s?)";
const TIME = "(?:\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?|noon|midnight)";
const DASH = "\\s*(?:-|–|—|to|until)\\s*";
const DAYS_EXPR = `(?:${DAY}(?:\\s*(?:-|–|—|to|through|thru)\\s*${DAY})?(?:\\s*(?:,|/|&|and|or)\\s*${DAY}(?:\\s*(?:-|–|—|to|through|thru)\\s*${DAY})?)*|weekdays|weekends|daily|every ?day|7 days(?: a week)?|24/7)`;
const SEG = new RegExp(`(${DAYS_EXPR})[,:]?\\s*(?:from\\s+|at\\s+|around\\s+|approximately\\s+|approx\\.?\\s+|about\\s+|~)?(${TIME})(?:${DASH}(${TIME}))?`, "gi");

function parseDays(expr: string): number[] {
  const e = expr.toLowerCase();
  if (/weekdays/.test(e)) return [1, 2, 3, 4, 5];
  if (/weekends/.test(e)) return [0, 6];
  if (/daily|every ?day|7 days|24\/7/.test(e)) return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  const parts = e.split(/\s*(?:,|\/|&|\band\b|\bor\b)\s*/);
  for (const p of parts) {
    const range = p.split(/\s*(?:-|–|—|\bto\b|through|thru)\s*/).filter(Boolean);
    const a = DAY_WORDS[range[0]?.trim()];
    if (a === undefined) continue;
    const b = range[1] !== undefined ? DAY_WORDS[range[1].trim()] : undefined;
    if (b === undefined) out.add(a);
    else for (let d = a; ; d = (d + 1) % 7) { out.add(d); if (d === b) break; }
  }
  return [...out].sort();
}

type T = { h: number; m: number; mer?: "am" | "pm" };
function parseTime(s: string): T {
  const t = s.toLowerCase().replace(/\./g, "").trim();
  if (t === "noon") return { h: 12, m: 0, mer: "pm" };
  if (t === "midnight") return { h: 0, m: 0, mer: "am" };
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)!;
  return { h: +m[1], m: m[2] ? +m[2] : 0, mer: m[3] as T["mer"] };
}
function to24(t: T, fallback?: "am" | "pm"): number {
  let mer = t.mer ?? fallback;
  if (!mer) mer = t.h >= 8 && t.h <= 11 ? "am" : "pm"; // street-service heuristic: 1–7 → pm
  let h = t.h % 12;
  if (mer === "pm") h += 12;
  return h * 60 + t.m;
}
const fmt = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Best-effort extraction of weekly spans from free text like "Tue/Thu 9:30–4" or "Mondays 4:30 PM". */
export function parseHours(text: string | null | undefined): ScheduleSpan[] {
  if (!text) return [];
  if (/24\s*(\/|hours?\s*a\s*day|-hour)\s*7|24\/7|24 hours/i.test(text)) {
    return [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "00:00", close: "23:59" }));
  }
  const spans: ScheduleSpan[] = [];
  for (const m of text.matchAll(SEG)) {
    const days = parseDays(m[1]);
    if (!days.length) continue;
    const a = parseTime(m[2]);
    const b = m[3] ? parseTime(m[3]) : undefined;
    let open: number, close: number;
    if (b) {
      close = to24(b);
      // Start inherits the end's meridiem when that keeps start < end ("2:30–3:30 PM").
      const withEnd = to24(a, b.mer);
      open = a.mer ? to24(a) : withEnd < close ? withEnd : to24(a);
      if (open >= close) open = to24({ ...a, mer: "am" });
    } else {
      open = to24(a);
      close = Math.min(open + 60, 23 * 60 + 59); // single start time → assume ~1 hour
    }
    for (const day of days) spans.push({ day, open: fmt(open), close: fmt(close) });
  }
  // de-dupe
  const seen = new Set<string>();
  return spans.filter((s) => (seen.has(JSON.stringify(s)) ? false : (seen.add(JSON.stringify(s)), true)));
}

/** Current day/minute in Boulder regardless of server timezone. */
export function denverNow(now = new Date()): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: SHORT.indexOf(get("weekday")), minutes: +get("hour") * 60 + +get("minute") };
}

const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
export function fmt12(hhmm: string): string {
  const min = toMin(hhmm);
  const h = Math.floor(min / 60), m = min % 60;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
}

export type OpenStatus =
  | { state: "open"; label: string; closesAt: string }
  | { state: "later-today"; label: string; opensAt: string; minutesUntil: number }
  | { state: "closed"; label: string; nextDay?: number }
  | { state: "unknown"; label: string };

export function openStatus(schedule: ScheduleSpan[] | null | undefined, now = new Date()): OpenStatus {
  if (!schedule || !schedule.length) return { state: "unknown", label: "Check hours" };
  const { day, minutes } = denverNow(now);
  const today = schedule.filter((s) => s.day === day).sort((a, b) => toMin(a.open) - toMin(b.open));
  for (const s of today) {
    if (minutes >= toMin(s.open) && minutes < toMin(s.close)) {
      return s.open === "00:00" && s.close === "23:59"
        ? { state: "open", label: "Open 24 hours", closesAt: s.close }
        : { state: "open", label: `Open now · until ${fmt12(s.close)}`, closesAt: s.close };
    }
    if (minutes < toMin(s.open)) {
      return { state: "later-today", label: `Today at ${fmt12(s.open)}`, opensAt: s.open, minutesUntil: toMin(s.open) - minutes };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const d = (day + i) % 7;
    const next = schedule.filter((s) => s.day === d).sort((a, b) => toMin(a.open) - toMin(b.open))[0];
    if (next) return { state: "closed", label: `${i === 1 ? "Tomorrow" : DAY_NAMES[d]} at ${fmt12(next.open)}`, nextDay: d };
  }
  return { state: "unknown", label: "Check hours" };
}

/** Compact human summary: "Tue 2:30–3:30pm · Fri 11am" */
export function scheduleSummary(schedule: ScheduleSpan[] | null | undefined): string {
  if (!schedule?.length) return "";
  if (schedule.length === 7 && schedule.every((s) => s.open === "00:00" && s.close === "23:59")) return "24/7";
  const byTime = new Map<string, number[]>();
  for (const s of schedule) {
    const k = `${s.open}-${s.close}`;
    byTime.set(k, [...(byTime.get(k) ?? []), s.day]);
  }
  return [...byTime.entries()]
    .map(([k, days]) => {
      const [o, c] = k.split("-");
      const ds = days.sort();
      const contiguous = ds.length > 2 && ds.every((d, i) => i === 0 || d === ds[i - 1] + 1);
      const dayLabel = contiguous ? `${SHORT[ds[0]]}–${SHORT[ds[ds.length - 1]]}` : ds.map((d) => SHORT[d]).join(", ");
      return `${dayLabel} ${fmt12(o)}–${fmt12(c)}`;
    })
    .join(" · ");
}
