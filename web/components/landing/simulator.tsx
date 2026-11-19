"use client";
import { useMemo, useState } from "react";
import { HZ, Q_DOWN, Q_UP, levelQuality, nextLevel, simulate, type RepParams } from "./sim";

const USUAL: RepParams = { range: 60, duration: 3, stalls: 0 };
const PRESETS = [
  { name: "Same as usual", p: USUAL },
  { name: "Slower, hesitant", p: { range: 56, duration: 4.6, stalls: 2 } },
  { name: "Quicker, shorter", p: { range: 38, duration: 2.1, stalls: 0 } },
];
const LEVEL = 4;
const GAP = 0.5;
const W = 760;
const H = 230;
const Y0 = 200;
const PXD = 2.1;

export function Simulator() {
  const [p, setP] = useState<RepParams>(PRESETS[1].p);
  const reps = useMemo(() => simulate([USUAL, USUAL, USUAL, p, p, p]), [p]);
  const lq = levelQuality(reps);
  const next = nextLevel(LEVEL, lq);

  const starts = reps.map((_, i) => GAP + reps.slice(0, i).reduce((a, r) => a + r.duration + GAP, 0));
  const totalS = GAP + reps.reduce((a, r) => a + r.duration + GAP, 0);
  const segs = reps.map((r, i) => ({ r, start: starts[i] }));
  const X = (s: number) => (s / totalS) * W;
  const set = (k: keyof RepParams) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) });

  return (
    <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
      <form className="grid content-start gap-6" onSubmit={(e) => e.preventDefault()} aria-label="Simulated movement settings">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-base font-medium">Today&apos;s three reps</legend>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((x) => {
              const on = x.p.range === p.range && x.p.duration === p.duration && x.p.stalls === p.stalls;
              return (
                <button
                  key={x.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setP(x.p)}
                  className={`min-h-11 rounded-lg border px-3 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring ${on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-accent"}`}
                >
                  {x.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Slider id="range" label="How far the forearm turns" value={p.range} unit="°" min={30} max={90} step={1} onChange={set("range")} />
        <Slider id="dur" label="Time for one rep" value={p.duration} unit=" s" min={2} max={6} step={0.1} onChange={set("duration")} />
        <Slider id="stalls" label="Hesitations during the rep" value={p.stalls} unit="" min={0} max={4} step={1} onChange={set("stalls")} />
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          The first three reps are this patient&apos;s usual. Each later rep is scored against the earlier ones, the same way the server does it.
        </p>
      </form>

      <div className="min-w-0">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Simulated roll signal for six reps: three usual reps, then three reps with the chosen settings." className="block h-auto w-full">
          {[0, 30, 60, 90].map((g) => (
            <g key={g}>
              <line x1="0" x2={W} y1={Y0 - g * PXD} y2={Y0 - g * PXD} stroke="var(--border)" strokeWidth="1" strokeDasharray={g === 0 ? "none" : "2 6"} />
              <text x="2" y={Y0 - g * PXD - 4} fontSize="11" fill="var(--muted-foreground)">
                {g}°
              </text>
            </g>
          ))}
          <rect x={X(segs[3].start - GAP / 2)} y="8" width={W - X(segs[3].start - GAP / 2)} height={Y0 - 8} fill="var(--brass)" opacity="0.08" />
          {segs.map(({ r, start }, i) => {
            const d = r.samples.map((a, k) => `${k ? "L" : "M"}${X(start + k / HZ).toFixed(1)},${(Y0 - a * PXD).toFixed(1)}`).join("");
            return (
              <g key={i}>
                <path d={d} fill="none" stroke={i < 3 ? "var(--primary)" : "var(--brass)"} strokeWidth="2.4" strokeLinejoin="round" />
                <text x={X(start + r.duration / 2)} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
                  rep {i + 1}
                </text>
              </g>
            );
          })}
          <text x={X(segs[0].start)} y="22" fontSize="12" fill="var(--primary)">
            usual
          </text>
          <text x={X(segs[3].start)} y="22" fontSize="12" fill="var(--brass-ink)">
            today
          </text>
        </svg>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-[0.9375rem]">
            <caption className="sr-only">Per-rep numbers for the simulated reps</caption>
            <thead className="text-sm text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-4 font-normal">Rep</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Range</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Time</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">Speed peaks</th>
                <th scope="col" className="py-2 font-normal">Quality score</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r, i) => (
                <tr key={i} className="border-b border-border/70">
                  <th scope="row" className="py-2.5 pr-4 font-normal">{i + 1}</th>
                  <td className="tnum py-2.5 pr-4 text-right">{Math.round(r.range)}°</td>
                  <td className="tnum py-2.5 pr-4 text-right">{r.duration.toFixed(1)} s</td>
                  <td className="tnum py-2.5 pr-4 text-right">{r.speedPeaks}</td>
                  <td className="py-2.5">
                    {r.quality === null ? (
                      <span className="text-muted-foreground">reference, not scored</span>
                    ) : (
                      <span className="flex items-center gap-3">
                        <span aria-hidden="true" className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-brass" style={{ width: `${r.quality}%` }} />
                        </span>
                        <span className="tnum w-8">{r.quality}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p aria-live="polite" className="mt-6 max-w-[62ch] text-lg leading-snug">
          Mean quality for the level is <span className="font-display tnum text-[1.75rem]">{lq ?? "–"}</span>.{" "}
          {next.why === "up" && <>The game moves up to level {next.level}.</>}
          {next.why === "repeat" && <>The game repeats level {next.level}.</>}
          {next.why === "down" && <>The game moves down to level {next.level}.</>}
        </p>
        <p className="mt-2 max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
          Illustration with simulated data. Up at {Q_UP} or above, down below {Q_DOWN}. These are placeholder values chosen for the prototype, not clinically validated, and the score does not measure recovery.
        </p>
      </div>
    </div>
  );
}

function Slider({ id, label, value, unit, min, max, step, onChange }: { id: string; label: string; value: number; unit: string; min: number; max: number; step: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-base">{label}</label>
        <output htmlFor={id} className="tnum text-base text-muted-foreground">{step < 1 ? value.toFixed(1) : value}{unit}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={onChange} className="h-11 w-full cursor-pointer accent-[var(--primary)]" />
    </div>
  );
}
