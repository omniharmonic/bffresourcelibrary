import { requireRole } from "@/lib/session";
import { getCatalog } from "@/lib/catalog";
import { chipsFor, rubricFor } from "@/lib/chips";
import { getSettings, aiAvailable } from "@/lib/settings";
import { Finder } from "@/components/Finder";

export const metadata = { title: "Find help" };

export default async function Navigator() {
  await requireRole("volunteer", "/navigator");
  const [c, settings] = await Promise.all([getCatalog(), getSettings()]);
  return (
    <>
      <h1 className="page-title">Find help</h1>
      <Finder mode="volunteer" chips={chipsFor(c)} rubric={rubricFor(c)} aiOn={settings.ai_assist && aiAvailable()} />
    </>
  );
}
