import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema } from "./db";
import { sendLoginCode } from "./email";
import { createHash } from "node:crypto";

/**
 * BETTER_AUTH_SECRET should always be set. If it is missing in production we derive a
 * private secret from DATABASE_URL (which contains the DB password) rather than ever
 * falling back to a value that is visible in this public repository.
 */
function authSecret() {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    console.warn("[auth] BETTER_AUTH_SECRET is not set; using a secret derived from DATABASE_URL. Set it in your hosting settings.");
    return createHash("sha256").update("bff-navigator-auth:" + process.env.DATABASE_URL).digest("base64");
  }
  return "dev-only-secret-change-me-dev-only-secret";
}

export function isBootstrapAdmin(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export const auth = betterAuth({
  appName: "BFF Navigator",
  secret: authSecret(),
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : undefined),
  // Allow the production domain plus this deployment's own Vercel URLs (previews, branch aliases).
  trustedOrigins: [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, ...(process.env.EXTRA_ORIGINS ?? "").split(",")]
    .map((h) => h?.trim())
    .filter(Boolean)
    .map((h) => (h!.startsWith("http") ? h! : `https://${h}`)),
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "participant", input: false },
      volunteerStatus: { type: "string", defaultValue: "none", input: false },
      displayName: { type: "string", required: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => ({
          data: {
            ...u,
            name: u.name || u.email.split("@")[0],
            role: isBootstrapAdmin(u.email) ? "admin" : "participant",
            volunteerStatus: isBootstrapAdmin(u.email) ? "approved" : "none",
          },
        }),
      },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      // Volunteers at a park often share one hotspot IP; 3/min (default) locks them out.
      rateLimit: { window: 60, max: 20 },
      async sendVerificationOTP({ email, otp }) {
        await sendLoginCode(email, otp);
      },
    }),
    nextCookies(),
  ],
});
