import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { getCurrentUser, hasRole } from "@/lib/session";

/**
 * Server-side speech-to-text fallback for browsers whose built-in speech API doesn't work
 * (e.g. Chromium forks without Google's speech service). Provider is chosen by env:
 *   DEEPGRAM_API_KEY  → Deepgram nova-3 (auto language detect, EN/ES)
 *   OPENAI_API_KEY    → OpenAI transcription
 * Audio is sent to the provider and not stored by us.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 6 * 1024 * 1024; // ~90s of opus audio

export async function GET() {
  return NextResponse.json({ available: !!(process.env.DEEPGRAM_API_KEY || process.env.OPENAI_API_KEY) });
}

export async function POST(req: Request) {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  if (!hasRole(user, "volunteer") && !settings.participant_mode) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }
  const type = req.headers.get("content-type") ?? "audio/webm";
  if (!/^audio\//.test(type)) return NextResponse.json({ error: "Expected audio" }, { status: 415 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "Empty recording" }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Recording too long — keep it under a minute." }, { status: 413 });

  try {
    if (process.env.DEEPGRAM_API_KEY) {
      const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true", {
        method: "POST",
        headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "Content-Type": type },
        body: buf,
        signal: AbortSignal.timeout(25_000),
      });
      if (!r.ok) throw new Error(`Deepgram ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } };
      return NextResponse.json({ text: j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "" });
    }
    if (process.env.OPENAI_API_KEY) {
      const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("file", new Blob([buf], { type }), `speech.${ext}`);
      form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe");
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(25_000),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { text?: string };
      return NextResponse.json({ text: j.text ?? "" });
    }
    return NextResponse.json({ error: "Voice transcription isn’t set up on this server." }, { status: 501 });
  } catch (e) {
    console.error("[transcribe]", (e as Error).message);
    return NextResponse.json({ error: "Couldn’t transcribe that. Try again or type instead." }, { status: 502 });
  }
}
