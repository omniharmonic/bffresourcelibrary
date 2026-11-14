import Link from "next/link";
import { requireUser } from "@/lib/session";
import { SignOut } from "@/components/SignOut";

export const metadata = { title: "Account" };

export default async function Account() {
  const u = await requireUser("/account");
  return (
    <div className="narrow">
      <h1>Account</h1>
      <div className="panel stack">
        <div>
          Signed in as <b>{u.email}</b>
        </div>
        <div>
          Access: <b>{u.role}</b>
          {u.role === "participant" && (
            <>
              {" "}
              · <Link href="/access">{u.volunteerStatus === "requested" ? "Volunteer request pending" : "I’m a BFF volunteer"}</Link>
            </>
          )}
        </div>
        <div className="btn-row">
          <Link className="btn" href="/plans">
            My plans
          </Link>
          <SignOut />
        </div>
      </div>
    </div>
  );
}
