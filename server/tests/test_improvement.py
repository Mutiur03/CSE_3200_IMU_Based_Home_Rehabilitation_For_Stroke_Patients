from improvement import compute_improvement


def S(q=None, d=None, r=None, p=None, sp=None):
    return {"mean_quality": q, "mean_duration_s": d, "mean_roll_range_deg": r, "mean_pitch_range_deg": p, "mean_speed_peaks": sp}


def test_too_few_sessions():
    imp = compute_improvement([S(q=60)] * 5)
    assert imp.index is None and imp.metrics == [] and imp.baseline_sessions == 3 and imp.current_sessions == 0
    assert compute_improvement([S(q=1)]).baseline_sessions == 1


def test_numbers():
    ss = [S(q=60, d=10, r=40)] * 3 + [S(q=75, d=8, r=40)] * 3
    imp = compute_improvement(ss)
    m = {x.name: x for x in imp.metrics}
    assert m["quality"].improvement_pct == 25.0  # (75-60)/60
    assert m["duration"].improvement_pct == 20.0  # down is better: (8-10)/10 * -1
    assert m["roll_range"].improvement_pct == 0.0
    assert set(m) == {"quality", "duration", "roll_range"}  # missing values skipped
    assert imp.index == 15.0  # (25 + 20 + 0) / 3


def test_median_and_zero_baseline():
    ss = [S(q=50, sp=0), S(q=100, sp=0), S(q=60, sp=0), S(q=70, sp=2), S(q=80, sp=2), S(q=90, sp=2)]
    imp = compute_improvement(ss)
    assert [m.name for m in imp.metrics] == ["quality"]  # speed_peaks baseline 0 skipped
    assert imp.metrics[0].baseline == 60 and imp.metrics[0].current == 80 and imp.index == 33.3


def test_no_metrics():
    assert compute_improvement([S()] * 6).index is None
