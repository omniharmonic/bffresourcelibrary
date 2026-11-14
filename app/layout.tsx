import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { PlanProvider } from "@/components/PlanProvider";
import { PlanBar } from "@/components/PlanBar";
import { getCurrentUser, hasRole } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "BFF Navigator", template: "%s · BFF Navigator" },
  description: "Boulder Feet Forward resource navigator — find help and build a support plan.",
  robots: { index: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f1a13" };

async function pendingCount() {
  try {
    return (await getDb().select({ id: schema.changeRequests.id }).from(schema.changeRequests).where(eq(schema.changeRequests.status, "pending"))).length;
  } catch {
    return 0;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const volunteer = hasRole(user, "volunteer");
  const admin = hasRole(user, "admin");
  const pending = admin ? await pendingCount() : 0;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:wght@380;420;500&family=Atkinson+Hyperlegible:wght@400;700&display=swap"
        />
      </head>
      <body>
        <PlanProvider>
          <header className="site-header">
            <div className="wrap">
              <Link href="/" className="brand">
                <span className="brand-mark" aria-hidden>
                  👣
                </span>
                <span>
                  BFF Navigator
                  <small>Boulder Feet Forward</small>
                </span>
              </Link>
              <nav className="nav" aria-label="Main">
                {volunteer && <Link href="/navigator">Find help</Link>}
                {!volunteer && settings.participant_mode && <Link href="/help">Find help</Link>}
                {volunteer && <Link href="/trees">Decision trees</Link>}
                {volunteer && <Link href="/services">Services</Link>}
                {user && <Link href="/plans">My plans</Link>}
                {volunteer && <Link href="/gaps">Gaps</Link>}
                {admin && (
                  <Link href="/admin">
                    Admin{pending ? <span className="badge">{pending}</span> : null}
                  </Link>
                )}
                {user ? <Link href="/account">Account</Link> : <Link href="/login">Sign in</Link>}
              </nav>
            </div>
          </header>
          <main>
            <div className="wrap">{children}</div>
          </main>
          <footer className="site-footer">
            <div className="wrap">
              Built with and for Boulder Feet Forward by Benjamin Life (@omniharmonic). Information changes — call ahead when you can. Service
              data includes City of Boulder, Boulder County and SAMHSA open data.
            </div>
          </footer>
          <PlanBar />
        </PlanProvider>
      </body>
    </html>
  );
}
