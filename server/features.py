"""Rep detection + per-rep features from one wrist-worn IMU (worn like a watch).

A watch moves with the forearm, so it tracks forearm motion, NOT the wrist joint:
  roll  = pronation/supination (rotation about the forearm, sensor X), rate = gyro.x
  pitch = forearm raise/lower (about sensor Y),                        rate = gyro.y
Pick which one a game task uses with `axis`. Mounting assumed: -X toward the hand, chip up (see orientation.py).

Input per sample: angle (deg) and angular rate about the same axis (deg/s).
A rep = leave the neutral angle by more than ENTER_DEG, then come back within EXIT_DEG.
Neutral is set once (first stillness) or by zero() (game calibration), then stays fixed, so continuous play
with no pause between reps still splits into reps. Angle differences are wrap-safe (roll wraps at +-180).
Raw data is never touched; reps are derived output.

ASSUMPTIONS, not validated: every number below is a tunable starting point, NOT a clinical threshold.
Tune on recorded play: `python features.py ../data/raw/<file>.jsonl [pitch|roll] [neutral_deg]`.
"""
import json
import sys

ENTER_DEG = 10.0  # excursion from neutral that starts a rep
EXIT_DEG = 5.0  # back within this of neutral ends the rep (hysteresis vs. ENTER_DEG)
REST_DPS = 10.0  # |rate| below this counts as still
REST_S = 0.5  # still this long, with no neutral yet -> neutral = current angle
MAX_REP_S = 30.0  # a "rep" longer than this is dropped (sensor slipped / user stopped mid-way)
MAX_GAP_S = 0.5  # sample gap longer than this (lost packets) -> abandon the rep in progress (neutral kept)
SMOOTH_N = 25  # moving-average window (samples, 0.25 s at 100 Hz) before counting speed peaks; 5 gave 15-29 "peaks" per rep = noise
PEAK_PROM = 0.25  # a speed peak must stand out from its neighbouring valleys by this fraction of the rep's peak speed
# SMOOTH_N / PEAK_PROM: picked on 6 recorded game reps (gave 2-7 peaks), no ground truth. Re-tune with more data.


def diff(a, b):
    """a - b wrapped to [-180, 180)."""
    return (a - b + 180) % 360 - 180


def _speed_peaks(speed):
    """Count prominent peaks of smoothed speed. Fewer = smoother (one bell per movement phase)."""
    n = SMOOTH_N
    sm = [sum(speed[max(0, i - n + 1) : i + 1]) / min(n, i + 1) for i in range(len(speed))]
    sm = [0.0, *sm, 0.0]  # a movement starts and ends at rest: edges are zero-speed valleys
    need = max(PEAK_PROM * max(sm), REST_DPS)  # relative to the rep's top speed, and never below the 'still' level
    count = 0
    for i in range(1, len(sm) - 1):
        if not sm[i - 1] < sm[i] >= sm[i + 1]:
            continue
        valleys = []
        for step in (-1, 1):  # walk down each side until something higher than the peak
            lo, j = sm[i], i
            while 0 <= j + step < len(sm) and sm[j + step] <= sm[i]:
                j += step
                lo = min(lo, sm[j])
            valleys.append(lo)
        if sm[i] - max(valleys) >= need:
            count += 1
    return count


class WristReps:
    def __init__(self):
        self.attempts = 0  # every excursion past ENTER_DEG and back (sensor movements, not game reps)
        self.neutral = None  # deg; None until first stillness or zero()
        self.moving = False
        self.still_since = None
        self.t = None
        self._start()

    def _start(self):
        self.t0 = None
        self.deltas = []  # angle minus neutral, wrapped
        self.speeds = []

    def zero(self, angle):
        """Set neutral to the current angle (game calibration). Abandons any rep in progress."""
        self.neutral, self.moving = angle, False
        self._start()

    def update(self, t_us, angle, rate):
        """Feed one sample. Returns a finished rep dict, or None."""
        if self.t is not None and (t_us - self.t) / 1e6 > MAX_GAP_S:
            self.moving, self.still_since = False, None
            self._start()
        self.t = t_us

        if self.neutral is None:
            if abs(rate) < REST_DPS:
                self.still_since = self.still_since or t_us
                if (t_us - self.still_since) / 1e6 >= REST_S:
                    self.neutral = angle
            else:
                self.still_since = None
            return None

        d = diff(angle, self.neutral)
        if not self.moving:
            if abs(d) > ENTER_DEG:
                self.moving, self.t0 = True, t_us
                self.deltas, self.speeds = [0.0], []
            return None

        self.deltas.append(d)
        self.speeds.append(abs(rate))
        dur = (t_us - self.t0) / 1e6
        if dur > MAX_REP_S:
            self.moving = False
            self._start()
            return None
        if abs(d) >= EXIT_DEG:
            return None

        self.moving = False
        peak = max(self.deltas, key=abs)
        self.attempts += 1
        rep = {
            "attempt": self.attempts,
            "t_end_us": t_us,
            "direction": "positive" if peak > 0 else "negative",  # sign per orientation.py; check with a known motion
            "range_deg": round(max(self.deltas) - min(self.deltas), 2),
            "peak_excursion_deg": round(peak, 2),
            "duration_s": round(dur, 3),
            "peak_speed_dps": round(max(self.speeds), 1),
            "speed_peaks": _speed_peaks(self.speeds),
        }
        self._start()
        return rep


def window_features(pitch, roll, speed):
    """Sensor features over one game rep. pitch/roll in deg, speed = |gyro| in deg/s, equal-length lists."""
    def span(a):  # unwrapped range: roll may cross +-180
        pos = [0.0]
        for p, q in zip(a, a[1:]):
            pos.append(pos[-1] + diff(q, p))
        return max(pos) - min(pos)

    return {
        "samples": len(speed),
        "pitch_range_deg": round(span(pitch), 2) if len(pitch) > 1 else 0.0,
        "roll_range_deg": round(span(roll), 2) if len(roll) > 1 else 0.0,
        "peak_speed_dps": round(max(speed, default=0.0), 1),
        "speed_peaks": _speed_peaks(speed),
    }


def pick(axis, pitch, roll, gx, gy):
    """(angle, rate) for the chosen axis."""
    return (pitch, gy) if axis == "pitch" else (roll, gx)


def replay(path, axis="roll", neutral=None):
    """Run a recorded raw .jsonl through the same Tilt + WristReps pipeline the server uses."""
    from orientation import Tilt

    tilt, reps, out = Tilt(), WristReps(), []
    if neutral is not None:
        reps.zero(neutral)  # same as pressing Zero before the session
    with open(path) as f:
        for line in f:
            for s in json.loads(line)["samples"]:
                a, g = s["accel"], s["gyro"]
                pitch, roll = tilt.update(s["timestamp"], a["x"], a["y"], a["z"], g["x"], g["y"])
                rep = reps.update(s["timestamp"], *pick(axis, pitch, roll, g["x"], g["y"]))
                if rep:
                    out.append(rep)
    return out


if __name__ == "__main__":
    for r in replay(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "roll", float(sys.argv[3]) if len(sys.argv) > 3 else None):
        print(json.dumps(r))
