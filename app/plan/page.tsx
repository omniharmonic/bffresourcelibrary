import { getCurrentUser, hasRole } from "@/lib/session";
import { PlanEditor } from "@/components/PlanEditor";

export const metadata = { title: "Plan" };

export default async function PlanPage() {
  const user = await getCurrentUser();
  return (
    <>
      <h1 style={{ fontSize: "clamp(28px,6vw,42px)" }}>Support plan</h1>
      <PlanEditor signedIn={!!user} volunteer={hasRole(user, "volunteer")} navigatorName={user?.displayName ?? undefined} />
    </>
  );
}
