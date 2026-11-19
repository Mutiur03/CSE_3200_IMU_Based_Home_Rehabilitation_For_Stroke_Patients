// Illustration only. A simulated forearm-roll signal and the same relative scoring idea the server uses (server/quality.py):
// timing = typical duration / this duration, smoothness = typical speed peaks / this speed peaks, each capped at 100, equal weights.
// Thresholds are the server's placeholder values, which are NOT clinically validated.
export const HZ = 50;
export const Q_UP = 90;
export const Q_DOWN = 60;

export type RepParams = { range: number; duration: number; stalls: number };
export type SimRep = { samples: number[]; range: number; duration: number; speedPeaks: number; quality: number | null; timing: number | null; smooth: number | null };

/** One roll excursion: out to `range` degrees and back over `duration` s. Each stall is a short dip in the outward-and-back arc. */
export function genRep({ range, duration, stalls }: RepParams): number[] {
  const n = Math.max(2, Math.round(duration * HZ));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const e = (1 - Math.cos(2 * Math.PI * u)) / 2; // out and back, speed zero at both ends
    let a = range * e;
    for (let k = 1; k <= stalls; k++) {
      const c = 0.2 + (0.6 * k) / (stalls + 1); // spread the stalls across the middle of the movement
      a -= 0.16 * range * e * Math.exp(-(((u - c) / 0.045) ** 2));
    }
    out.push(a);
  }
  return out;
}

/** Count velocity peaks: local maxima of |d angle/dt| above a quarter of the fastest speed, at least 0.15 s apart. */
export function speedPeaks(samples: number[]): number {
  const v = samples.slice(1).map((x, i) => Math.abs(x - samples[i]) * HZ);
  const s = v.map((_, i) => (v[Math.max(0, i - 1)] + v[i] + v[Math.min(v.length - 1, i + 1)]) / 3);
  const thr = 0.25 * Math.max(...s);
  const gap = Math.round(0.15 * HZ);
  let peaks = 0;
  let last = -gap;
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] > thr && s[i] >= s[i - 1] && s[i] > s[i + 1] && i - last >= gap) {
      peaks++;
      last = i;
    }
  }
  return Math.max(1, peaks);
}

const median = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  const m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};

/** Build reps in order; rep 1 is the reference (no score), later reps are scored against the earlier ones. */
export function simulate(params: RepParams[]): SimRep[] {
  const reps: SimRep[] = [];
  params.forEach((p, i) => {
    const samples = genRep(p);
    const peaks = speedPeaks(samples);
    const base = { samples, range: Math.max(...samples), duration: p.duration, speedPeaks: peaks };
    if (i === 0) return reps.push({ ...base, quality: null, timing: null, smooth: null });
    const timing = Math.min(1, median(reps.map((r) => r.duration)) / p.duration);
    const smooth = Math.min(1, median(reps.map((r) => r.speedPeaks)) / peaks);
    reps.push({ ...base, timing: Math.round(100 * timing), smooth: Math.round(100 * smooth), quality: Math.round(50 * timing + 50 * smooth) });
  });
  return reps;
}

export function levelQuality(reps: SimRep[]): number | null {
  const q = reps.map((r) => r.quality).filter((x): x is number => x !== null);
  return q.length ? Math.round((10 * q.reduce((a, b) => a + b, 0)) / q.length) / 10 : null;
}

export function nextLevel(level: number, q: number | null): { level: number; why: "up" | "repeat" | "down" } {
  if (q === null || q >= Q_UP) return { level: (level % 9) + 1, why: "up" };
  if (q < Q_DOWN) return { level: Math.max(1, level - 1), why: "down" };
  return { level, why: "repeat" };
}
