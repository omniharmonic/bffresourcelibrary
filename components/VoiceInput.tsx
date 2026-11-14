"use client";

import { useEffect, useRef, useState } from "react";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type W = { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };

const UNSUPPORTED_KEY = "bff-voice-unsupported";
const UNSUPPORTED_MSG =
  "Voice typing doesn’t work in this browser. Open this page in Chrome, Safari, Edge or Firefox — or tap the 🎤 on your phone’s keyboard.";

/**
 * Mic button using the browser's own speech recognition only (we run no speech-to-text service).
 * Some Chromium-based browsers (e.g. Dia, Arc, Brave) include the API without a working speech
 * service; we detect that, remember it, and tell people plainly to use a supported browser.
 */
export function VoiceInput({ onText, getBase }: { onText: (text: string) => void; getBase: () => string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const rec = useRef<SpeechRec | null>(null);

  useEffect(() => {
    const w = window as unknown as W;
    let flagged = false;
    try {
      flagged = localStorage.getItem(UNSUPPORTED_KEY) === "1";
    } catch {}
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition) && !flagged);
  }, []);

  function markUnsupported() {
    try {
      localStorage.setItem(UNSUPPORTED_KEY, "1");
    } catch {}
    setSupported(false);
    setListening(false);
    setHint(UNSUPPORTED_MSG);
  }

  function start() {
    const w = window as unknown as W;
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return markUnsupported();
    setHint(null);
    const r = new Rec();
    r.lang = navigator.language?.toLowerCase().startsWith("es") ? "es-US" : "en-US";
    r.interimResults = true;
    r.continuous = true;
    const base = getBase();
    let gotResult = false;
    let failed = false;
    const startedAt = Date.now();
    r.onresult = (e) => {
      gotResult = true;
      const said = Array.from(e.results)
        .map((x) => x[0].transcript)
        .join(" ");
      onText((base ? base.trimEnd() + " " : "") + said.trim());
    };
    r.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed") setHint("Microphone access is blocked. Allow the mic for this site in your browser settings, then try again.");
      else if (e.error === "network" || e.error === "service-not-allowed" || e.error === "language-not-supported") {
        failed = true;
        markUnsupported();
      } else if (e.error === "no-speech") setHint("Didn’t hear anything — tap the mic and try again.");
    };
    r.onend = () => {
      setListening(false);
      // Unsupported browsers often end instantly with nothing and no error.
      if (!failed && !gotResult && Date.now() - startedAt < 1500) markUnsupported();
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      markUnsupported();
    }
  }

  if (supported === null) return null;
  return (
    <div className="voice">
      <button
        type="button"
        className={`btn mic${listening ? " on" : ""}${supported ? "" : " off"}`}
        onClick={() => (listening ? rec.current?.stop() : supported ? start() : setHint(UNSUPPORTED_MSG))}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : supported ? "Speak instead of typing" : "Voice typing not available in this browser"}
        title={listening ? "Listening… tap to stop" : supported ? "Speak" : "Voice typing not available in this browser"}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
          {!supported && <path d="M3 3l18 18" />}
        </svg>
      </button>
      {listening && (
        <span className="voice-state" aria-live="polite">
          Listening… tap to stop
        </span>
      )}
      {hint && !listening && (
        <span className="voice-hint" role="status">
          {hint}
        </span>
      )}
    </div>
  );
}
