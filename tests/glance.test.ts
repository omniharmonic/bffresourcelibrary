import { describe, it, expect } from "vitest";
import { extractStreetAddress, extractMeetingSpot, glance } from "@/lib/glance";
import { parseHours } from "@/lib/hours";

describe("extractStreetAddress", () => {
  it.each([
    ["4869 N Broadway, Boulder; confirm service access on arrival.", "4869 N Broadway, Boulder"],
    ["3080 Broadway, Boulder; ages 12–24; weekdays approximately 11–5, verify.", "3080 Broadway, Boulder"],
    ["St. John’s Episcopal, 1419 Pine St, Thursday approximately 2–3 PM.", "1419 Pine St, Boulder"],
    ["1107 W Century Drive, Louisville; verify 24/7 hours", "1107 W Century Drive, Louisville"],
    ["Boulder pop-up reportedly Wednesdays at 2650 Table Mesa, approximately 5–8 PM", "2650 Table Mesa, Boulder"],
  ])("%s", (text, want) => expect(extractStreetAddress(text)).toBe(want));
  it("ignores phones and times", () => {
    expect(extractStreetAddress("Call 303-444-6121 ext. 119.")).toBeNull();
    expect(extractStreetAddress("Tuesdays 11 AM–noon")).toBeNull();
  });
});

describe("extractMeetingSpot", () => {
  it("strips a leading day/time and keeps the place", () => {
    expect(extractMeetingSpot("Tuesday 2:30–3:30 PM. Central Park — southeast corner; people often gather from ~2:00")).toBe("Central Park — southeast corner");
    expect(extractMeetingSpot("Monday 12:00–1:00 PM. Bandshell — southeast/top corner of bleachers")).toBe("Bandshell — southeast/top corner of bleachers");
  });
  it("rejects instructions that aren't places", () => {
    expect(extractMeetingSpot("Call or text 988.")).toBeNull();
    expect(extractMeetingSpot("Ask BFF for warm handoff.")).toBeNull();
  });
});

describe("glance", () => {
  it("builds when / where / phone / facts", () => {
    const g = glance(
      { access: "4869 N Broadway, Boulder; confirm on arrival", schedule: parseHours("Mon-Fri 8am-5pm"), phone: "303-555-0100", details: { walkIn: true, cost: "Free for everyone", idRequired: false } },
      new Date("2026-11-17T17:00:00Z"), // Tue 10am MST
    );
    expect(g.when.state).toBe("open");
    expect(g.when.hours).toBe("Mon–Fri 8am–5pm");
    expect(g.where).toMatchObject({ text: "4869 N Broadway, Boulder", kind: "address" });
    expect(g.where?.mapUrl).toContain("maps.google.com");
    expect(g.phone).toBe("303-555-0100");
    expect(g.facts).toEqual(["Walk-ins welcome", "Free", "No ID needed"]);
  });
  it("prefers the structured address and says 'Call for hours' when unknown", () => {
    const g = glance({ address: "1001 Arapahoe Ave, Boulder, CO 80302", access: "3080 Broadway" });
    expect(g.where?.text).toBe("1001 Arapahoe Ave, Boulder, CO 80302");
    expect(g.when.label).toBe("Call for hours");
  });
});
