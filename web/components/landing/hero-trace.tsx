"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HZ, genRep, simulate, type RepParams } from "./sim";

// Illustration: a simulated forearm-roll signal scrolling past, with the per-rep numbers the system would record.
const PLAN: RepParams[] = [
  { range: 62, duration: 3.2, stalls: 0 },
  { range: 64, duration: 3.0, stalls: 0 },
  { range: 60, duration: 3.1, stalls: 0 },
  { range: 58, duration: 4.4, stalls: 2 },
  { range: 63, duration: 3.0, stalls: 0 },
  { range: 65, duration: 2.9, stalls: 0 },
  { range: 52, duration: 4.8, stalls: 3 },
  { range: 64, duration: 3.0, stalls: 0 },
];
const GAP = 1.3; // seconds at rest between reps
const WINDOW = 9; // seconds on screen
const W = 720;
const H = 240;
const Y0 = 205; // y of 0 degrees
const PX_PER_DEG = 2.6;

function buildTrack() {
  const samples: number[] = [];
  const ends: number[] = [];
  const noise = (i: number) => 0.5 * Math.sin(i * 1.7) + 0.35 * Math.sin(i * 0.41 + 1);
  const rest = () => {
    for (let k = 0; k < GAP * HZ; k++) samples.push(noise(samples.length));
  };
  rest();
  PLAN.forEach((p) => {
    genRep(p).forEach((a) => samples.push(a + noise(samples.length)));
    ends.push(samples.length);
    rest();
  });
  return { samples, ends };
}

const TRACK = buildTrack();
const REPS = simulate(PLAN);

// SSR renders the animated state; a reduced-motion visitor switches to a still picture after hydration.
const RM = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const m = window.matchMedia(RM);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

const fmt = (v: number | null, unit = "") => (v === null ? "–" : `${v}${unit}`);

export function HeroTrace() {
  const { samples, ends } = TRACK;
  const reps = REPS;
  const path = useRef<SVGPathElement>(null);
  const tip = useRef<SVGCircleElement>(null);
  const [counted, setDone] = useState(0);
  const still = useSyncExternalStore(subscribeMotion, () => window.matchMedia(RM).matches, () => false);
  const done = still ? PLAN.length : counted;

  useEffect(() => {
    const x = (i: number, start: number) => ((i - start) / (WINDOW * HZ)) * W;
    const y = (a: number) => Y0 - a * PX_PER_DEG;
    if (still) {
      const step = Math.ceil(samples.length / 600);
      const pts = samples.filter((_, i) => i % step === 0).map((a, k) => `${((k * step) / samples.length) * W},${y(a)}`);
      path.current?.setAttribute("d", `M${pts.join("L")}`);
      tip.current?.setAttribute("r", "0");
      return;
    }
    const total = samples.length + 2 * HZ;
    const t0 = performance.now();
    let raf = 0;
    let shown = 0;
    const frame = (now: number) => {
      const head = Math.floor(((now - t0) / 1000) * HZ) % total;
      const start = head - WINDOW * HZ;
      const from = Math.max(0, Math.floor(start));
      const to = Math.min(head, samples.length - 1);
      let d = "";
      for (let i = from; i <= to; i += 2) d += `${d ? "L" : "M"}${x(i, start).toFixed(1)},${y(samples[i]).toFixed(1)}`;
      path.current?.setAttribute("d", d);
      if (to >= from) {
        tip.current?.setAttribute("cx", x(to, start).toFixed(1));
        tip.current?.setAttribute("cy", y(samples[to]).toFixed(1));
      }
      const n = ends.filter((e) => e <= head).length;
      if (n !== shown) {
        shown = n;
        setDone(n);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [samples, ends, still]);

  const last = done > 0 ? reps[done - 1] : null;
  return (
    <figure className="m-0">
      <div className="rounded-2xl border border-sidebar-border bg-[#0b1a20] p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-rail-muted">
          <span>Forearm roll, degrees</span>
          <span>{still ? "Simulated signal" : "Simulated signal, live"}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A simulated forearm roll signal: repeated smooth swings out and back, with a few hesitant ones." className="mt-3 block h-auto w-full">
          {[0, 30, 60].map((g) => (
            <g key={g}>
              <line x1="0" x2={W} y1={Y0 - g * PX_PER_DEG} y2={Y0 - g * PX_PER_DEG} stroke="var(--sidebar-border)" strokeWidth="1" strokeDasharray={g === 0 ? "none" : "2 7"} />
              <text x="4" y={Y0 - g * PX_PER_DEG - 5} fontSize="11" fill="var(--rail-muted)">
                {g}°
              </text>
            </g>
          ))}
          <path ref={path} fill="none" stroke="var(--brass)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          <circle ref={tip} r="4.5" fill="var(--brass)" />
        </svg>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-sidebar-border pt-5 sm:grid-cols-4">
          <Read label="Reps counted" value={String(done)} />
          <Read label="Last range" value={fmt(last && Math.round(last.range), "°")} />
          <Read label="Last duration" value={fmt(last && Number(last.duration.toFixed(1)), " s")} />
          <Read label="Quality score" value={last ? (last.quality === null ? "first rep" : String(last.quality)) : "–"} accent small={last?.quality === null} />
        </dl>
      </div>
    </figure>
  );
}

function Read({ label, value, accent = false, small = false }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-rail-muted">{label}</dt>
      <dd className={`font-display tnum mt-1 whitespace-nowrap leading-none ${small ? "pt-2 text-[1.25rem]" : "text-[2rem]"} ${accent ? "text-brass" : "text-rail-foreground"}`}>{value}</dd>
    </div>
  );
}
