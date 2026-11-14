"use client";

import Link from "next/link";
import { useState } from "react";
import { usePlan } from "./PlanProvider";

export function PlanActions({ url, layout, token, editable, planId, items }: {
  url: string; layout: string; token: string; editable: boolean; planId: string;
  items: { serviceId: string; name: string; tier: number; note?: string }[];
}) {
  const plan = usePlan();
  const [copied, setCopied] = useState(false);
  return (
    <div className="btn-row no-print" style={{ marginBottom: 16 }}>
      <button className="btn btn-primary" onClick={() => window.print()}>
        🖨️ Print / Save PDF
      </button>
      <Link className="btn" href={`/p/${token}?layout=${layout === "receipt" ? "letter" : "receipt"}`}>
        {layout === "receipt" ? "Full-page layout" : "Receipt layout"}
      </Link>
      <button
        className="btn"
        onClick={async () => {
          try {
            if (navigator.share) await navigator.share({ title: "Support plan", url });
            else {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }
          } catch {}
        }}
      >
        {copied ? "Link copied ✓" : "Share link"}
      </button>
      {editable && (
        <button
          className="btn"
          onClick={() => {
            plan.replace({ planId, items });
            window.location.href = "/plan";
          }}
        >
          Edit plan
        </button>
      )}
      {editable && (
        <button
          className="btn btn-ghost"
          onClick={() => {
            plan.clear();
            window.location.href = "/navigator";
          }}
        >
          Start a new plan
        </button>
      )}
    </div>
  );
}
