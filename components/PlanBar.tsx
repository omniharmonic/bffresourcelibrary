"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePlan } from "./PlanProvider";

/** Ask before discarding an unsaved plan; saved plans stay in My plans. */
export function useStartNewPlan() {
  const plan = usePlan();
  const router = useRouter();
  const path = usePathname();
  return () => {
    const unsaved = plan.basket.items.length > 0 && !plan.basket.planId;
    if (unsaved && !confirm("Start a new plan? This one hasn’t been saved and will be cleared.")) return;
    plan.clear();
    const home = path.startsWith("/help") ? "/help" : path.startsWith("/navigator") || path.startsWith("/trees") ? path : "/navigator";
    router.push(home);
  };
}

export function PlanBar() {
  const { basket, ready } = usePlan();
  const path = usePathname();
  const startNew = useStartNewPlan();
  if (!ready || !basket.items.length || path.startsWith("/plan") || path.startsWith("/p/") || path.startsWith("/admin") || path === "/login") return null;
  const n = basket.items.length;
  return (
    <div className="planbar" role="region" aria-label="Current support plan">
      <div className="wrap planbar-inner">
        <div className="planbar-count">
          <span className="planbar-num" aria-hidden>
            {n}
          </span>
          <span>
            {n === 1 ? "service" : "services"} in plan
            {basket.forLabel ? <span className="planbar-for"> · {basket.forLabel}</span> : null}
          </span>
        </div>
        <div className="planbar-actions">
          <button type="button" className="btn btn-sm btn-outline-light" onClick={startNew}>
            New plan
          </button>
          <Link className="btn btn-sm btn-primary" href="/plan">
            Review →
          </Link>
        </div>
      </div>
    </div>
  );
}
