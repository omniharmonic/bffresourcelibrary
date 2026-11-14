import type { Service, Catalog } from "./catalog";
import { openStatus, scheduleSummary } from "./hours";
import type { ScheduleSpan } from "./db/schema";

/** What the browser gets for a service. Internal notes only for volunteers. */
export type ServiceCard = {
  id: string;
  name: string;
  organization: string | null;
  summary: string | null;
  access: string | null;
  hoursText: string | null;
  schedule: string;
  open: { state: string; label: string };
  phone: string | null;
  url: string | null;
  address: string | null;
  eligibility: string | null;
  petPolicy: string | null;
  police: string | null;
  rules: string | null;
  rulesUrl: string | null;
  fieldNotes: string | null;
  internalNotes?: string | null;
  preferred: boolean;
  status: string;
  verifiedAt: string | null;
  verificationNote: string | null;
  categories: { slug: string; name: string }[];
  tier: number;
  reasons?: string[];
  endsAt: string | null;
};

export function toCard(s: Service, c: Catalog, opts: { volunteer: boolean; tier?: number; reasons?: string[]; now?: Date }): ServiceCard {
  const cats = s.categories.map((slug) => c.categoryMap.get(slug)).filter(Boolean) as { slug: string; name: string; tier: number }[];
  return {
    id: s.id,
    name: s.name,
    organization: s.organization,
    summary: s.summary,
    access: s.access,
    hoursText: s.hoursText,
    schedule: scheduleSummary(s.schedule as ScheduleSpan[] | null),
    open: (({ state, label }) => ({ state, label }))(openStatus(s.schedule as ScheduleSpan[] | null, opts.now)),
    phone: s.phone,
    url: s.url,
    address: s.address,
    eligibility: s.eligibility,
    petPolicy: s.petPolicy,
    police: s.police,
    rules: s.rules,
    rulesUrl: s.rulesUrl,
    fieldNotes: s.fieldNotes,
    ...(opts.volunteer ? { internalNotes: s.internalNotes } : {}),
    preferred: s.preferred,
    status: s.status,
    verifiedAt: s.verifiedAt ? new Date(s.verifiedAt).toISOString() : null,
    verificationNote: s.verificationNote,
    categories: cats.map(({ slug, name }) => ({ slug, name })),
    tier: opts.tier ?? (cats.length ? Math.min(...cats.map((x) => x.tier)) : 2),
    reasons: opts.reasons,
    endsAt: s.endsAt ? new Date(s.endsAt).toISOString() : null,
  };
}
