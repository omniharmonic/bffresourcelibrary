import Link from "next/link";
import { getCurrentUser, hasRole } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export default async function Home() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const volunteer = hasRole(user, "volunteer");
  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <p className="eyebrow" style={{ marginTop: 16 }}>
        Boulder Feet Forward · Meeting people where they are
      </p>
      <h1>Find help in Boulder, and leave with a plan.</h1>
      <p className="muted" style={{ fontSize: 20 }}>
        Describe what’s going on in plain words. We’ll suggest places to go today, ways to handle it next time, and support for the long run.
      </p>
      <div className="doors">
        <Link className="door" href={volunteer ? "/navigator" : user ? "/access" : "/login?next=/navigator"}>
          <div className="big" aria-hidden>
            🤝
          </div>
          <h2>I’m helping someone</h2>
          <p className="muted">For trained BFF navigators and volunteers. Sign in with your email.</p>
        </Link>
        <Link className="door" href="/help">
          <div className="big" aria-hidden>
            🧭
          </div>
          <h2>I need help</h2>
          <p className="muted">
            {settings.participant_mode ? "Tell us what you need and get a list you can keep." : "Find out where to meet a BFF navigator in person."}
          </p>
        </Link>
      </div>
      <div className="panel" style={{ marginTop: 24 }}>
        <b>In danger or thinking about suicide?</b> Call or text <a href="tel:988">988</a> any time. For a life-threatening emergency call{" "}
        <a href="tel:911">911</a>.
      </div>
    </div>
  );
}
