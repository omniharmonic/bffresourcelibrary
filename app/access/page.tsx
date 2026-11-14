import Link from "next/link";
import { requireUser } from "@/lib/session";
import { requestVolunteerAccess } from "@/app/actions";

export const metadata = { title: "Volunteer access" };

export default async function Access() {
  const u = await requireUser("/access");
  if (u.role !== "participant")
    return (
      <div className="narrow">
        <h1>You’re all set</h1>
        <p>
          You have <b>{u.role}</b> access. <Link href="/navigator">Go to the navigator →</Link>
        </p>
      </div>
    );
  return (
    <div className="narrow">
      <h1>Volunteer access</h1>
      {u.volunteerStatus === "requested" ? (
        <div className="ok">Thanks! Your request is waiting for Libby or a BFF admin to approve it. You’ll have access as soon as they do.</div>
      ) : u.volunteerStatus === "rejected" ? (
        <div className="notice">Your volunteer request wasn’t approved. If you think that’s a mistake, talk to Libby at BFF.</div>
      ) : (
        <form action={requestVolunteerAccess} className="panel">
          <p>
            Navigator access is for people who’ve completed BFF’s volunteer training. Ask for access below and an admin will approve it.
          </p>
          <div className="field">
            <label htmlFor="displayName">First name (shown to admins)</label>
            <input id="displayName" name="displayName" type="text" maxLength={60} />
          </div>
          <button className="btn btn-primary">Request volunteer access</button>
        </form>
      )}
    </div>
  );
}
