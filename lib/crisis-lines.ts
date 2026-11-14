/** Crisis options shown first whenever crisis language is detected. Confirm with BFF before launch. */
export const CRISIS_LINES = [
  { label: "988 Suicide & Crisis Lifeline", detail: "Call or text 988 · 24/7 · talk to a counselor, not police", href: "tel:988", kinds: ["suicide", "violence", "medical", "overdose"] },
  { label: "Walk-in Crisis Center (Clinica)", detail: "1107 W Century Dr, Louisville · open 24/7 · no appointment", href: "https://maps.google.com/?q=1107+W+Century+Dr+Louisville+CO", kinds: ["suicide", "overdose"] },
  { label: "SPAN 24-hour hotline", detail: "303-444-2424 · domestic & sexual violence support", href: "tel:+13034442424", kinds: ["violence"] },
  { label: "911 — emergency", detail: "Overdose, not breathing, serious injury. Colorado's Good Samaritan law protects people who call for an overdose.", href: "tel:911", kinds: ["overdose", "medical", "violence", "suicide"] },
  { label: "Boulder BHCR (crisis clinicians)", detail: "Ask for Behavioral Health Crisis Response via 303-441-3333 (non-emergency; may include police)", href: "tel:+13034413333", kinds: ["suicide"] },
] as const;
