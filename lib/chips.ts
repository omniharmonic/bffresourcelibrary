import type { Chip, RubricDim } from "@/components/Finder";
import type { Catalog } from "./catalog";

export const QUICK_CHIPS: Chip[] = [
  { slug: "free-meals", label: "Food", icon: "🍲" },
  { slug: "shelters", label: "Sleep tonight", icon: "🛏️" },
  { slug: "showers", label: "Shower", icon: "🚿" },
  { slug: "bathrooms", label: "Bathroom", icon: "🚻" },
  { slug: "device-charging", label: "Charge phone", icon: "🔌" },
  { slug: "identification-and-documents", label: "ID & papers", icon: "🪪" },
  { slug: "medical-care", label: "Medical", icon: "🩺" },
  { slug: "mental-and-behavioral-health-care", label: "Mental health", icon: "💬" },
  { slug: "harm-reduction", label: "Harm reduction", icon: "💉" },
  { slug: "clothing-and-gear", label: "Clothes & gear", icon: "🧥" },
  { slug: "laundry", label: "Laundry", icon: "🧺" },
  { slug: "storage", label: "Storage", icon: "🎒" },
  { slug: "pets", label: "Pets", icon: "🐕" },
  { slug: "transportation-assistance", label: "Bus & rides", icon: "🚌" },
  { slug: "short-term-work-day-labor", label: "Work", icon: "🛠️" },
  { slug: "housing", label: "Housing", icon: "🏠" },
];

export function chipsFor(c: Catalog): Chip[] {
  return QUICK_CHIPS.filter((x) => c.categoryMap.has(x.slug));
}

export function rubricFor(c: Catalog): RubricDim[] {
  return c.dimensions.map((d) => ({
    slug: d.slug,
    name: d.name,
    color: d.color,
    tiers: [1, 2, 3].map((tier) => ({
      tier,
      cats: c.categories
        .filter((x) => (x.dimensionSlug === d.slug && x.tier === tier) || x.alsoIn?.some((a) => a.dimension === d.slug && a.tier === tier))
        .map((x) => ({ slug: x.slug, name: x.name })),
    })),
  }));
}
