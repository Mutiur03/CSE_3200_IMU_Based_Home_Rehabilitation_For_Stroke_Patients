import { PlayClient } from "@/components/patient/play-client";

// Production: same origin (/play/). Local dev without Docker: NEXT_PUBLIC_PLAY_URL=http://localhost:8000/play/ (the login cookie is shared across localhost ports).
const PLAY = process.env.NEXT_PUBLIC_PLAY_URL ?? "/play/";

// Same-origin build: probe it from the server so a missing game shows a calm message, not the iframe's 404 page.
async function gameAvailable() {
  if (PLAY.startsWith("http")) return true;
  try {
    const r = await fetch(`${process.env.API_ORIGIN ?? "http://127.0.0.1:8000"}/play/`, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5_000) });
    return r.ok;
  } catch {
    return false;
  }
}

export default async function PlayPage() {
  return <PlayClient src={PLAY} available={await gameAvailable()} />;
}
