import { normalize } from "./text";

export type CrisisKind = "suicide" | "overdose" | "violence" | "medical";
export type CrisisResult = { level: "none" | "concern" | "urgent"; kinds: CrisisKind[]; matched: string[] };

const PATTERNS: { kind: CrisisKind; level: "concern" | "urgent"; re: RegExp }[] = [
  { kind: "suicide", level: "urgent", re: /\b(kill(ing)? my ?self|suicid\w*|end (it all|my life)|want(ed)? to die|wanna die|better off dead|no reason to live|hang(ing)? myself|jump(ing)? off|matarme|quiero morir|suicidarme)\b/ },
  { kind: "suicide", level: "concern", re: /\b(hopeless|cant go on|can not go on|give up on (life|everything)|self harm|cutting myself|hurt(ing)? myself|no quiero vivir)\b/ },
  { kind: "overdose", level: "urgent", re: /\b(overdos\w*|od(ing|ed|d)?|not breathing|wont wake up|turning blue|blue lips|sobredosis)\b/ },
  { kind: "violence", level: "urgent", re: /\b(raped|sexual(ly)? assault\w*|being (beaten|followed|hunted)|someone is (hurting|after) me|threaten\w* to kill|stabbed|got stabbed|shot|me violaron|me golpe\w*)\b/ },
  { kind: "violence", level: "concern", re: /\b(domestic violence|abus(e|ive|ed)|beat(s|ing)? me|hits me|not safe|unsafe|scared for my life|violencia)\b/ },
  { kind: "medical", level: "urgent", re: /\b(chest pain|cant breathe|can not breathe|seizure|bleeding (a lot|bad|badly)|unconscious|stroke|frostbite|hypotherm\w*|heat stroke|no puedo respirar)\b/ },
];

export function detectCrisis(text: string): CrisisResult {
  const n = " " + normalize(text) + " ";
  const kinds = new Set<CrisisKind>();
  const matched: string[] = [];
  let level: CrisisResult["level"] = "none";
  for (const p of PATTERNS) {
    const m = n.match(p.re);
    if (m) {
      // Negation guard: "not suicidal", "never wanted to die"
      const before = n.slice(Math.max(0, (m.index ?? 0) - 18), m.index);
      if (/\b(not|never|no longer|isnt|wasnt|dont)\s+(\w+\s+)?$/.test(before)) continue;
      kinds.add(p.kind);
      matched.push(m[0].trim());
      if (p.level === "urgent") level = "urgent";
      else if (level === "none") level = "concern";
    }
  }
  return { level, kinds: [...kinds], matched };
}
