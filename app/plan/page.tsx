import { getCurrentUser, hasRole } from "@/lib/session";
import { PlanEditor } from "@/components/PlanEditor";

export const metadata = { title: "Plan" };

export default async function PlanPage() {
  const user = await getCurrentUser();
  return (
    <>
      <h1 className="page-title">Support plan</h1>
      <PlanEditor signedIn={!!user} volunteer={hasRole(user, "volunteer")} navigatorName={user?.displayName ?? undefined} />
    </>
  );
}
