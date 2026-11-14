import { describe, it, expect } from "vitest";
import { parseHours, openStatus, scheduleSummary } from "@/lib/hours";

describe("parseHours", () => {
  it("parses day + range with shared meridiem", () => {
    expect(parseHours("Tuesday 2:30–3:30 PM. Central Park")).toEqual([{ day: 2, open: "14:30", close: "15:30" }]);
  });
  it("parses lists of days and single start times", () => {
    expect(parseHours("BFF Tuesdays 2:30–3:30 PM and Fridays 11:00 AM")).toEqual([
      { day: 2, open: "14:30", close: "15:30" },
      { day: 5, open: "11:00", close: "12:00" },
    ]);
  });
  it("parses slash lists and meridiem-less ranges", () => {
    expect(parseHours("reportedly Tue/Thu 9:30–4.")).toEqual([
      { day: 2, open: "09:30", close: "16:00" },
      { day: 4, open: "09:30", close: "16:00" },
    ]);
  });
  it("parses weekdays and noon", () => {
    expect(parseHours("weekdays approximately 11–5")).toHaveLength(5);
    expect(parseHours("Tuesdays 11 AM–noon")).toEqual([{ day: 2, open: "11:00", close: "12:00" }]);
  });
  it("parses day ranges", () => {
    const s = parseHours("Mon-Fri 8am-5pm");
    expect(s.map((x) => x.day)).toEqual([1, 2, 3, 4, 5]);
    expect(s[0]).toEqual({ day: 1, open: "08:00", close: "17:00" });
  });
  it("handles 24/7", () => {
    expect(parseHours("24-hour hotline, 24/7")).toHaveLength(7);
  });
  it("ignores text without days", () => {
    expect(parseHours("Call 303-444-6121 ext. 119.")).toEqual([]);
  });
});

describe("openStatus", () => {
  const sched = [{ day: 2, open: "14:30", close: "15:30" }];
  // 2026-11-17 is a Tuesday. 21:00Z = 2pm MST.
  it("later today", () => {
    const s = openStatus(sched, new Date("2026-11-17T21:00:00Z"));
    expect(s.state).toBe("later-today");
    expect(s.label).toBe("Today at 2:30pm");
  });
  it("open now", () => {
    expect(openStatus(sched, new Date("2026-11-17T21:45:00Z")).state).toBe("open");
  });
  it("next week", () => {
    expect(openStatus(sched, new Date("2026-11-18T18:00:00Z")).label).toBe("Tuesday at 2:30pm");
  });
  it("summary", () => {
    expect(scheduleSummary(parseHours("Mon-Fri 8am-5pm"))).toBe("Mon–Fri 8am–5pm");
  });
});
