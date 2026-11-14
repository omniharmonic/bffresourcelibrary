import { describe, it, expect } from "vitest";
import { compileTerms, scoreCategories, match, mergeAi, type MatchService } from "@/lib/match";

const terms = compileTerms([
  { phrase: "hungry", categorySlug: "free-meals", weight: 0.9 },
  { phrase: "havent eaten", categorySlug: "free-meals", weight: 0.9 },
  { phrase: "shower", categorySlug: "showers", weight: 0.95 },
  { phrase: "lost my id", categorySlug: "identification-and-documents", weight: 0.95 },
  { phrase: "phone is dead", categorySlug: "device-charging", weight: 0.9 },
  { phrase: "stuff taken", categorySlug: "storage", weight: 0.5 },
]);
const categories = [
  { slug: "free-meals", name: "Free Meals", tier: 1, dimensionSlug: "physical" },
  { slug: "showers", name: "Showers", tier: 1, dimensionSlug: "environmental" },
  { slug: "identification-and-documents", name: "ID", tier: 1, dimensionSlug: "occupational" },
  { slug: "device-charging", name: "Charging", tier: 2, dimensionSlug: "intellectual" },
  { slug: "storage", name: "Storage", tier: 2, dimensionSlug: "environmental" },
];
const svc = (id: string, cats: string[], extra: Partial<MatchService> = {}): MatchService => ({
  id, name: id, categories: cats, preferred: false, status: "active", ...extra,
});
const services = [
  svc("meal-a", ["free-meals"]),
  svc("meal-b", ["free-meals"], { preferred: true }),
  svc("shower-place", ["showers"], { summary: "Hot showers and laundry" }),
  svc("closed", ["free-meals"], { status: "inactive" }),
  svc("popup-past", ["free-meals"], { endsAt: "2020-01-01" }),
  svc("library", ["device-charging"], { summary: "Library with outlets and wifi" }),
];

describe("scoreCategories", () => {
  it("matches phrases with stemming and filler words", () => {
    const s = scoreCategories("I haven't really eaten and need showers", terms);
    expect(s.map((c) => c.slug)).toEqual(expect.arrayContaining(["free-meals", "showers"]));
  });
  it("tolerates typos on longer words", () => {
    expect(scoreCategories("so hungrey", terms)[0]?.slug).toBe("free-meals");
  });
  it("respects negation", () => {
    expect(scoreCategories("I'm not hungry, I just lost my ID", terms).map((c) => c.slug)).toEqual(["identification-and-documents"]);
  });
});

describe("match", () => {
  it("ranks preferred first, drops inactive/expired, groups by tier", () => {
    const r = match({ text: "hungry and my phone is dead" }, { terms, services, categories });
    const ids = r.results.map((x) => x.service.id);
    expect(ids[0]).toBe("meal-b");
    expect(ids).not.toContain("closed");
    expect(ids).not.toContain("popup-past");
    expect(r.byTier[1].length).toBe(2);
    expect(r.byTier[2].map((x) => x.service.id)).toEqual(["library"]);
  });
  it("chips select categories without text", () => {
    expect(match({ text: "", chips: ["showers"] }, { terms, services, categories }).results[0].service.id).toBe("shower-place");
  });
  it("falls back to keyword search", () => {
    const r = match({ text: "laundry" }, { terms, services, categories });
    expect(r.usedFallback).toBe(true);
    expect(r.results[0].service.id).toBe("shower-place");
  });
  it("AI can add categories but only ones we know", () => {
    const merged = mergeAi([], { showers: 0.9, "made-up": 0.9, storage: 0.2 });
    expect(merged.map((c) => c.slug)).toEqual(["showers", "made-up"]);
    const r = match({ text: "", ai: { showers: 0.9, "made-up": 0.99 } }, { terms, services, categories });
    expect(r.categories.map((c) => c.slug)).toEqual(["showers"]);
  });
});
