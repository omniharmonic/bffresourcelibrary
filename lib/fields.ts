/** Editable service fields, in form order. `long` → textarea. `volunteerOnly` → hidden from participants. */
export const SERVICE_FIELDS = [
  { key: "name", label: "Name", long: false },
  { key: "organization", label: "Organization", long: false },
  { key: "summary", label: "What it is (one or two sentences)", long: true },
  { key: "access", label: "How to access / where to go", long: true },
  { key: "hoursText", label: "Hours (e.g. “Mon–Fri 9am–3pm”, “Tuesdays 2:30–3:30 PM”)", long: false },
  { key: "address", label: "Address or meeting spot", long: false },
  { key: "phone", label: "Phone", long: false },
  { key: "url", label: "Website", long: false },
  { key: "email", label: "Email", long: false },
  { key: "eligibility", label: "Who can use it / what to bring", long: true },
  { key: "petPolicy", label: "Pets", long: false },
  { key: "police", label: "Police presence", long: false },
  { key: "rules", label: "Rules & barriers", long: true },
  { key: "rulesUrl", label: "Rules link", long: false },
  { key: "fieldNotes", label: "Field notes — what to expect (shared on plans)", long: true },
  { key: "internalNotes", label: "Internal notes (volunteers only, never printed)", long: true, volunteerOnly: true },
] as const;

export type ServiceFieldKey = (typeof SERVICE_FIELDS)[number]["key"];
export const FIELD_KEYS = SERVICE_FIELDS.map((f) => f.key) as ServiceFieldKey[];
export const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  [...SERVICE_FIELDS.map((f) => [f.key, f.label.split(" (")[0]]), ["categories", "Categories"], ["status", "Status"], ["preferred", "BFF preferred"], ["startsAt", "Starts"], ["endsAt", "Ends"]],
);

export const TIER_LABEL: Record<number, { title: string; blurb: string }> = {
  1: { title: "Right now", blurb: "Where to get it today" },
  2: { title: "Next time", blurb: "How to get it yourself next time" },
  3: { title: "Long term", blurb: "Steady support that changes things" },
};
