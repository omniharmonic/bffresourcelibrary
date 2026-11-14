import { Resend } from "resend";

/**
 * Reserved test domains (RFC 2606) never receive real mail. Sending to them via Resend
 * would bounce and hurt the sending domain's reputation (the e2e suite uses example.org).
 */
const NEVER_SEND = /@(example\.(com|org|net)|[^@]+\.(test|invalid|localhost))$/i;

export async function sendLoginCode(email: string, otp: string) {
  const key = process.env.RESEND_API_KEY;
  const subject = `${otp} is your BFF Navigator code`;
  const text = `Your Boulder Feet Forward Navigator sign-in code is ${otp}\n\nIt expires in 10 minutes. If you didn't ask for this, you can ignore this email.`;
  if (!key || NEVER_SEND.test(email)) {
    console.log(`\n[dev email] to=${email} code=${otp}\n`);
    return;
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "BFF Navigator <onboarding@resend.dev>",
    to: email,
    subject,
    text,
  });
  if (error) console.error("[email] send failed", error);
}
