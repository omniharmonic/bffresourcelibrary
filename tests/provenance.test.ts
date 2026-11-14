import { describe, it, expect } from "vitest";
import { decideFeedUpdate } from "@/lib/provenance";

describe("decideFeedUpdate (human wins)", () => {
  const at = "2026-01-01T00:00:00Z";
  it("auto-applies to empty fields and fields the same feed owns", () => {
    const d = decideFeedUpdate(
      { phone: "", address: "1 Old St", name: "X" },
      { address: { source: "feed:city-wifi", at }, name: { source: "feed:city-wifi", at } },
      [],
      { phone: "303", address: "2 New St", name: "X" },
      "city-wifi",
    );
    expect(d.apply).toEqual({ phone: "303", address: "2 New St" });
    expect(d.review).toEqual({});
    expect(d.unchanged).toEqual(["name"]);
  });
  it("sends human-owned and locked fields to review", () => {
    const d = decideFeedUpdate(
      { phone: "111", hoursText: "Tue 2pm" },
      { phone: { source: "volunteer:u1", at }, hoursText: { source: "feed:findtreatment", at } },
      ["hoursText"],
      { phone: "222", hoursText: "Wed 3pm" },
      "findtreatment",
    );
    expect(d.apply).toEqual({});
    expect(d.review).toEqual({ phone: "222", hoursText: "Wed 3pm" });
  });
  it("another feed cannot overwrite a different feed's value without review", () => {
    const d = decideFeedUpdate({ url: "a" }, { url: { source: "feed:a", at } }, [], { url: "b" }, "b");
    expect(d.review).toEqual({ url: "b" });
  });
});
