import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export type Role = "participant" | "volunteer" | "admin";
export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  volunteerStatus: string;
  displayName?: string | null;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as unknown as CurrentUser;
  return { id: u.id, email: u.email, name: u.name, role: (u.role ?? "participant") as Role, volunteerStatus: u.volunteerStatus ?? "none", displayName: u.displayName };
});

const RANK: Record<Role, number> = { participant: 0, volunteer: 1, admin: 2 };
export const hasRole = (u: CurrentUser | null, role: Role) => !!u && RANK[u.role] >= RANK[role];

export async function requireUser(next = "/") {
  const u = await getCurrentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function requireRole(role: Role, next = "/") {
  const u = await requireUser(next);
  if (!hasRole(u, role)) redirect(role === "admin" ? "/navigator" : "/access");
  return u;
}
