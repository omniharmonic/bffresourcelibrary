import Link from "next/link";
import { getCatalog } from "@/lib/catalog";
import { chipsFor } from "@/lib/chips";
import { getSettings, aiAvailable } from "@/lib/settings";
import { getCurrentUser, hasRole } from "@/lib/session";
import { Finder } from "@/components/Finder";

export const metadata = { title: "I need help" };

export default async function Help() {
  const [c, settings, user] = await Promise.all([getCatalog(), getSettings(), getCurrentUser()]);
  if (!settings.participant_mode && !hasRole(user, "volunteer")) {
    return (
      <div className="narrow">
        <h1>Talk with a BFF navigator</h1>
        <div className="panel stack">
          <p style={{ fontSize: 20 }}>
            Boulder Feet Forward peer navigators meet people in <b>Central Park (southeast corner)</b> on <b>Tuesdays 2:30–3:30pm</b> and{" "}
            <b>Fridays at 11am</b>. They can help you find food, showers, ID, shelter, health care, housing and more, and give you a written plan.
          </p>
          <p>
            In danger or thinking about suicide? Call or text <a href="tel:988">988</a> any time. Emergency: <a href="tel:911">911</a>.
          </p>
          <p className="muted small">
            Have a plan link from a navigator? Open it any time. No account needed. <Link href="/login">Navigator sign-in</Link>
          </p>
        </div>
      </div>
    );
  }
  return (
    <>
      <h1 style={{ fontSize: "clamp(28px,6vw,42px)" }}>What do you need?</h1>
      <p className="muted">Free and private. You don’t need an account. Nothing you type is shared with police or the city.</p>
      <Finder mode="participant" chips={chipsFor(c)} aiOn={settings.ai_assist && aiAvailable()} />
    </>
  );
}
