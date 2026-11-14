import Link from "next/link";
import { getCurrentUser, hasRole } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export default async function Home() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const volunteer = hasRole(user, "volunteer");
  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <section className="hero">
        <p className="eyebrow">Boulder Feet Forward · Meeting people where they are</p>
        <h1>Find help in Boulder, and leave with a plan.</h1>
        <p className="lede">
          Describe what’s going on in plain words. We’ll suggest where to go today, how to handle it next time, and support for the long run.
        </p>
      </section>
      <div className="doors">
        <Link className="door" href={volunteer ? "/navigator" : user ? "/access" : "/login?next=/navigator"}>
          <span className="door-icon" aria-hidden>
            🤝
          </span>
          <span>
            <h2>I’m helping someone</h2>
            <p>For trained BFF navigators and volunteers. Sign in with your email.</p>
            <span className="go">{volunteer ? "Open the navigator →" : "Sign in →"}</span>
          </span>
        </Link>
        <Link className="door" href="/help">
          <span className="door-icon" aria-hidden>
            🧭
          </span>
          <span>
            <h2>I need help</h2>
            <p>{settings.participant_mode ? "Tell us what you need and get a list you can keep." : "Find out where to meet a BFF navigator in person."}</p>
            <span className="go">Start here →</span>
          </span>
        </Link>
      </div>
      <div className="safety">
        <span aria-hidden style={{ fontSize: 22 }}>
          ☎️
        </span>
        <span>
          <b>In danger or thinking about suicide?</b> Call or text <a href="tel:988">988</a> any time. Life-threatening emergency:{" "}
          <a href="tel:911">911</a>.
        </span>
      </div>
    </div>
  );
}
