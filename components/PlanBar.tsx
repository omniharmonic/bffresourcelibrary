"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePlan } from "./PlanProvider";

export function PlanBar() {
  const { basket, ready } = usePlan();
  const path = usePathname();
  if (!ready || !basket.items.length || path.startsWith("/plan") || path.startsWith("/p/") || path.startsWith("/admin")) return null;
  const n = basket.items.length;
  return (
    <div className="planbar" role="region" aria-label="Support plan">
      <div className="wrap">
        <span>
          <b>{n}</b> {n === 1 ? "service" : "services"} in this plan
          {basket.forLabel ? <span className="muted" style={{ color: "#b9c1a6" }}> · for {basket.forLabel}</span> : null}
        </span>
        <Link className="btn btn-primary btn-sm" href="/plan">
          Review plan →
        </Link>
      </div>
    </div>
  );
}
