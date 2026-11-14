"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type W = { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };

const MODE_KEY = "bff-voice-mode"; // "browser" | "server" | "none"

/**
 * Mic button that works across browsers:
 *  1. Browser speech recognition (Chrome, Safari, Firefox w/ flag) — free, instant.
 *  2. If that fails (Chromium forks like Dia/Brave/Arc lack Google's speech backend → "network"
 *     error), remember it and fall back to recording + server transcription (/api/transcribe).
 *  3. If neither is available, explain how to use the keyboard's dictation key.
 */
export function VoiceInput({ onText, getBase }: { onText: (text: string) => void; getBase: () => string }) {
  const [state, setState] = useState<"idle" | "listening" | "recording" | "transcribing">("idle");
  const [hint, setHint] = useState<string | null>(null);
  const [mode, setMode] = useState<"browser" | "server" | "none" | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  const media = useRef<MediaRecorder | null>(null);
  const gotResult = useRef(false);
  const failedOver = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const w = window as unknown as W;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODE_KEY);
    } catch {}
    const hasBrowser = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    const hasRecorder = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    if (saved === "server" && hasRecorder) setMode("server");
    else if (hasBrowser && saved !== "server") setMode("browser");
    else if (hasRecorder) setMode("server");
    else setMode("none");
  }, []);

  function remember(m: "browser" | "server" | "none") {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  }

  async function startServer() {
    setHint(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setHint("Microphone access was blocked. Allow the mic for this site, or use your keyboard’s 🎤 key.");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearTimeout(timer.current);
      const blob = new Blob(chunks, { type: (mr.mimeType || "audio/webm").split(";")[0] });
      if (!blob.size) return setState("idle");
      setState("transcribing");
      try {
        const r = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
        const j = (await r.json()) as { text?: string; error?: string };
        if (r.status === 501) {
          remember("none");
          setHint("Voice typing isn’t available in this browser. Tap the 🎤 on your phone’s keyboard to dictate instead.");
        } else if (!r.ok) setHint(j.error ?? "Couldn’t transcribe that. Try again.");
        else if (j.text?.trim()) {
          const base = getBase();
          onText((base ? base.trimEnd() + " " : "") + j.text.trim());
        } else setHint("Didn’t catch that — try again a little closer to the mic.");
      } catch {
        setHint("No connection — try again, or type instead.");
      }
      setState("idle");
    };
    media.current = mr;
    mr.start();
    setState("recording");
    timer.current = setTimeout(() => mr.state === "recording" && mr.stop(), 60_000);
  }

  function startBrowser() {
    const w = window as unknown as W;
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return startServer();
    setHint(null);
    const r = new Rec();
    r.lang = navigator.language?.toLowerCase().startsWith("es") ? "es-US" : "en-US";
    r.interimResults = true;
    r.continuous = true;
    const base = getBase();
    gotResult.current = false;
    failedOver.current = false;
    const failOver = () => {
      if (failedOver.current) return;
      failedOver.current = true;
      remember("server");
      setHint("Switching to recording mode for this browser…");
      startServer();
    };
    r.onresult = (e) => {
      gotResult.current = true;
      const said = Array.from(e.results)
        .map((x) => x[0].transcript)
        .join(" ");
      onText((base ? base.trimEnd() + " " : "") + said.trim());
    };
    r.onerror = (e) => {
      setState("idle");
      if (e.error === "not-allowed") {
        setHint("Microphone access was blocked. Allow the mic for this site, or use your keyboard’s 🎤 key.");
      } else if (e.error === "network" || e.error === "service-not-allowed" || e.error === "language-not-supported") {
        // This browser exposes the API but has no speech service behind it.
        failOver();
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setHint("Voice input stopped. Tap the mic to try again.");
      }
    };
    const startedAt = Date.now();
    r.onend = () => {
      // Some Chromium forks don't error — they just end instantly with nothing. Treat that as unsupported.
      if (failedOver.current) return;
      if (!gotResult.current && Date.now() - startedAt < 1500) return failOver();
      setState((s) => (s === "listening" ? "idle" : s));
    };
    rec.current = r;
    try {
      r.start();
      setState("listening");
      if (mode !== "browser") remember("browser");
    } catch {
      failOver();
    }
  }

  function toggle() {
    if (state === "listening") return rec.current?.stop();
    if (state === "recording") return media.current?.stop();
    if (state === "transcribing") return;
    if (mode === "none") {
      setHint("Voice typing isn’t available in this browser. Tap the 🎤 on your phone’s keyboard to dictate instead.");
      return;
    }
    if (mode === "server") startServer();
    else startBrowser();
  }

  if (mode === null) return null;
  const active = state === "listening" || state === "recording";
  const label = state === "listening" ? "Listening… tap to stop" : state === "recording" ? "Recording… tap to stop" : state === "transcribing" ? "Transcribing…" : "Speak";
  return (
    <div className="voice">
      <button
        type="button"
        className={`btn mic${active ? " on" : ""}`}
        onClick={toggle}
        aria-pressed={active}
        aria-label={label}
        title={label}
        disabled={state === "transcribing"}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
        </svg>
      </button>
      {(active || state === "transcribing") && <span className="voice-state" aria-live="polite">{label}</span>}
      {hint && !active && (
        <span className="voice-hint" role="status">
          {hint}
        </span>
      )}
    </div>
  );
}
