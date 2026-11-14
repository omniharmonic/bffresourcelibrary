import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { PlanProvider } from "@/components/PlanProvider";
import { PlanBar } from "@/components/PlanBar";
import { SiteNav, type NavItem } from "@/components/SiteNav";
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
  const nav: NavItem[] = [
    ...(volunteer ? [{ href: "/navigator", label: "Find help" }] : settings.participant_mode ? [{ href: "/help", label: "Find help" }] : []),
    ...(volunteer ? [{ href: "/trees", label: "Decision trees" }, { href: "/services", label: "Services" }] : []),
    ...(user ? [{ href: "/plans", label: "My plans" }] : []),
    ...(volunteer ? [{ href: "/suggestions", label: "My suggestions" }, { href: "/gaps", label: "Gaps" }] : []),
    ...(admin ? [{ href: "/admin", label: "Admin", badge: pending }] : []),
    user ? { href: "/account", label: "Account" } : { href: "/login", label: "Sign in" },
  ];
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
              <Link href="/" className="brand" aria-label="BFF Navigator home">
                <span className="brand-mark" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <ellipse cx="8" cy="15" rx="3.2" ry="4.6" />
                    <circle cx="5.6" cy="8.4" r="1.2" /><circle cx="8" cy="7.4" r="1.25" /><circle cx="10.4" cy="8.2" r="1.15" />
                    <ellipse cx="16.2" cy="11" rx="3" ry="4.3" />
                    <circle cx="13.9" cy="4.7" r="1.1" /><circle cx="16.2" cy="3.8" r="1.15" /><circle cx="18.5" cy="4.6" r="1.05" />
                  </svg>
                </span>
                <span>
                  <span className="brand-name">BFF Navigator</span>
                  <small>Boulder Feet Forward</small>
                </span>
              </Link>
              <SiteNav items={nav} />
            </div>
          </header>
          <main>
            <div className="wrap">{children}</div>
          </main>
          <footer className="site-footer">
            <div className="wrap">
              <p style={{ margin: 0 }}>
                In crisis? Call or text <a href="tel:988">988</a> any time · Emergency <a href="tel:911">911</a>
              </p>
              <p style={{ margin: "6px 0 0" }}>
                Built with and for Boulder Feet Forward by Benjamin Life (@omniharmonic). Hours change — call ahead when you can. Includes City of
                Boulder, Boulder County and SAMHSA open data.
              </p>
            </div>
          </footer>
          <PlanBar />
        </PlanProvider>
      </body>
    </html>
  );
}
