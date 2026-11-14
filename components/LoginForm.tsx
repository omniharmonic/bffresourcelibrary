"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    if (error) setError(error.message ?? "Couldn’t send a code. Check the email and try again.");
    else setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
    setBusy(false);
    if (error) setError(error.message ?? "That code didn’t work. Try again or get a new one.");
    else window.location.href = next;
  }

  return step === "email" ? (
    <form onSubmit={sendCode} className="panel">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="hint" style={{ marginTop: 6 }}>
          We’ll email you a 6-digit code. No password needed.
        </p>
      </div>
      {error && <div className="notice">{error}</div>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Sending…" : "Email me a code"}
      </button>
    </form>
  ) : (
    <form onSubmit={verify} className="panel">
      <p>
        We sent a code to <b>{email}</b>.
      </p>
      <div className="field">
        <label htmlFor="code">6-digit code</label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          style={{ fontSize: 28, letterSpacing: "0.3em", maxWidth: 220 }}
        />
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="btn-row">
        <button className="btn btn-primary" disabled={busy || code.length < 6}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setStep("email")}>
          Use a different email
        </button>
      </div>
    </form>
  );
}
