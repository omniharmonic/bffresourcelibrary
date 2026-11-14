"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type BasketItem = { serviceId: string; name: string; tier: number; note?: string };
export type Basket = {
  planId?: string | null;
  items: BasketItem[];
  forLabel?: string;
  intakeText?: string;
  note?: string;
  navigatorName?: string;
  tags?: string;
  showLabel?: boolean;
};

type Ctx = {
  basket: Basket;
  has: (id: string) => boolean;
  toggle: (item: BasketItem) => void;
  update: (id: string, patch: Partial<BasketItem>) => void;
  remove: (id: string) => void;
  setMeta: (patch: Partial<Basket>) => void;
  replace: (b: Basket) => void;
  clear: () => void;
  ready: boolean;
};

const PlanCtx = createContext<Ctx | null>(null);
const KEY = "bff-plan-v1";

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [basket, setBasket] = useState<Basket>({ items: [] });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setBasket(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(basket));
    } catch {}
  }, [basket, ready]);

  const has = useCallback((id: string) => basket.items.some((i) => i.serviceId === id), [basket]);
  const value = useMemo<Ctx>(
    () => ({
      basket,
      ready,
      has,
      toggle: (item) =>
        setBasket((b) =>
          b.items.some((i) => i.serviceId === item.serviceId)
            ? { ...b, items: b.items.filter((i) => i.serviceId !== item.serviceId) }
            : { ...b, items: [...b.items, item] },
        ),
      update: (id, patch) => setBasket((b) => ({ ...b, items: b.items.map((i) => (i.serviceId === id ? { ...i, ...patch } : i)) })),
      remove: (id) => setBasket((b) => ({ ...b, items: b.items.filter((i) => i.serviceId !== id) })),
      setMeta: (patch) => setBasket((b) => ({ ...b, ...patch })),
      replace: (b) => setBasket(b),
      clear: () => setBasket({ items: [] }),
    }),
    [basket, ready, has],
  );
  return <PlanCtx.Provider value={value}>{children}</PlanCtx.Provider>;
}

export function usePlan() {
  const c = useContext(PlanCtx);
  if (!c) throw new Error("usePlan outside PlanProvider");
  return c;
}
