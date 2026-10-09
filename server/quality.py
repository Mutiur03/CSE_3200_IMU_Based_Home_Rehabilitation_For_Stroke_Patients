"""Movement-quality score per game rep, and which level to play next.

Quality compares a rep with the player's OWN earlier reps of the SAME task in this session, so it needs no
clinical reference values (none exist for this setup). Two scale-free parts, each capped at 100 (doing better
than your usual does not score above 100):
  timing     = typical duration / this duration      (faster than usual = 100)
  smoothness = typical speed_peaks / this speed_peaks (fewer velocity peaks than usual = 100)
The first rep of a task has nothing to compare with, so it gets no score (None) and does not move difficulty.
Movement range is not scored: the game already requires a task-specific reach to complete a rep.

ASSUMPTIONS, not validated: the formula, equal weights, and every threshold below are engineering placeholders
to close the sensing -> game loop. Replace them with experimentally justified values before drawing conclusions.
The score does not measure rehabilitation effectiveness.
"""
from statistics import median

W_TIMING = 0.5
W_SMOOTH = 0.5
Q_UP = 90  # level quality at/above this: go up a level
Q_DOWN = 60  # level quality below this: go down a level; in between: repeat the level
N_LEVELS = 9  # the game has 9 levels, one task each; level N = difficulty N (1 easiest, 9 hardest)


def score(rep: dict, history: list[dict]):
    """Quality for `rep` (needs duration_s, speed_peaks, task) vs earlier reps in `history`, or None."""
    prior = [h for h in history if h["task"] == rep["task"]]
    if not prior:
        return None
    timing = min(1.0, median(h["duration_s"] for h in prior) / max(rep["duration_s"], 1e-6))
    smooth = min(1.0, median(max(1, h["speed_peaks"]) for h in prior) / max(1, rep["speed_peaks"]))
    return {
        "quality": round(100 * (W_TIMING * timing + W_SMOOTH * smooth)),
        "timing_score": round(100 * timing),
        "smoothness_score": round(100 * smooth),
    }


def level_quality(run: list[dict]):
    """Mean quality of the scored reps of the level being played (the first rep of a task is unscored), or None."""
    qs = [r["quality"] for r in run if r.get("quality") is not None]
    return round(sum(qs) / len(qs), 1) if qs else None


def next_level(level: int, quality):
    """Level to play next. Good quality: up (after the last level, back to 1 as the game always did). Poor: one down.
    In between: repeat. No score (nothing to judge): plain progression."""
    up = level % N_LEVELS + 1
    if quality is None or quality >= Q_UP:
        return up
    if quality < Q_DOWN:
        return max(1, level - 1)
    return level
