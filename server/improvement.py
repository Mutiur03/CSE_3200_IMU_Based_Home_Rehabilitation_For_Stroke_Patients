"""Improvement index: descriptive change of a patient's own metrics, first 3 sessions vs last 3. Not clinically validated."""
from statistics import median

from schemas import Improvement, MetricChange

WINDOW = 3
# metric name -> (per-session key, higher_is_better)
METRICS = {"roll_range": ("mean_roll_range_deg", True), "pitch_range": ("mean_pitch_range_deg", True),
           "duration": ("mean_duration_s", False), "speed_peaks": ("mean_speed_peaks", False), "quality": ("mean_quality", True)}


def _med(sessions, key):
    vals = [s[key] for s in sessions if s.get(key) is not None]
    return median(vals) if vals else None


def compute_improvement(sessions: list[dict]) -> Improvement:
    """sessions: time-ordered dicts with the per-session keys in METRICS."""
    if len(sessions) < 2 * WINDOW:
        return Improvement(baseline_sessions=min(WINDOW, len(sessions)), current_sessions=0, metrics=[], index=None)
    first, last = sessions[:WINDOW], sessions[-WINDOW:]
    out = []
    for name, (key, up) in METRICS.items():
        b, c = _med(first, key), _med(last, key)
        if not b or c is None:  # baseline 0/None or no current value
            continue
        pct = (c - b) / b * 100 * (1 if up else -1)
        out.append(MetricChange(name=name, baseline=b, current=c, improvement_pct=round(pct, 1)))
    index = round(sum(m.improvement_pct for m in out) / len(out), 1) if out else None
    return Improvement(baseline_sessions=WINDOW, current_sessions=WINDOW, metrics=out, index=index)
