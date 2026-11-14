import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema } from "./db";
import { sendLoginCode } from "./email";

export function isBootstrapAdmin(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export const auth = betterAuth({
  appName: "BFF Navigator",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-dev-only-secret",
  baseURL: process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
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
      async sendVerificationOTP({ email, otp }) {
        await sendLoginCode(email, otp);
      },
    }),
    nextCookies(),
  ],
});
