import { describe, it, expect } from "vitest";
import { detectCrisis } from "@/lib/crisis";
import { redact } from "@/lib/redact";

describe("detectCrisis", () => {
  it("flags suicidal language as urgent", () => {
    expect(detectCrisis("honestly I want to die, nothing matters").level).toBe("urgent");
    expect(detectCrisis("quiero morir").kinds).toContain("suicide");
  });
  it("flags overdose", () => {
    expect(detectCrisis("my friend is not breathing, I think he overdosed").kinds).toContain("overdose");
  });
  it("respects negation", () => {
    expect(detectCrisis("I'm not suicidal, just need food").level).toBe("none");
  });
  it("ignores ordinary needs", () => {
    expect(detectCrisis("need a shower and a bus pass").level).toBe("none");
  });
});

describe("redact", () => {
  it("removes contact details and names", () => {
    const r = redact("My name is Jordan Smith, call 303-555-1212 or j@x.org, I stay at 1234 Pine St");
    expect(r).not.toMatch(/Jordan|555|j@x|1234 Pine/);
    expect(r).toMatch(/\[name\].*\[phone\].*\[email\].*\[address\]/);
  });
});
