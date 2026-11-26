from datetime import datetime, timedelta, timezone

import report
from schemas import PlanOut, SessionOut

T0 = datetime(2026, 11, 1, tzinfo=timezone.utc)


def S(i, q=None, roll=None, load=None, reps=3):
    t = T0 + timedelta(days=i)
    return SessionOut(id=i, patient_id=1, device_id="d", started_at=t, ended_at=t + timedelta(minutes=10), n_reps=reps,
                      mean_quality=q, dropped_packets=0, sample_rate_hz=100, mean_roll_range_deg=roll, mean_duration_s=5,
                      mean_speed_peaks=3 if q is not None else None, mean_peak_load_kg=load)


def test_words_and_bands():
    assert report.change_words(2)[0] == "about the same as"
    assert report.change_words(8) == ("slightly better than", "good")
    assert report.change_words(-20) == ("clearly worse than", "alert")
    assert report.band(95) == "high" and report.band(70) == "moderate" and report.band(10) == "low" and report.band(None) is None
    assert report.trend([None], True) is None
    assert round(report.trend([10, 20], False)[0]) == -100  # lower is better: a rise is worse


def test_build_report():
    plan = PlanOut(patient_id=1, levels_allowed=[1, 2], reps_per_level=3, sessions_per_week=7, adapt_on=True)
    ss = [S(0, q=50, roll=20), S(1, q=55, roll=22), S(2, q=60), S(3, q=80, roll=30), S(4, q=85), S(5, q=90, roll=33),
          S(6, load=2.0), S(7, load=2.6), S(8, reps=0)]
    r = report.build(patient_id=1, name="Pat", sessions=ss, assessments=[], plan=plan, flags=[], now=T0 + timedelta(days=9))
    assert r.status == "improving" and "movement quality is better" in r.headline
    keys = [s.key for s in r.sections]
    assert keys == ["adherence", "quality", "range", "speed", "force", "marks", "consider"]
    adh = r.sections[0]
    assert any(p.label == "Sessions without exercises" for p in adh.points)
    assert any(p.label == "Plan" and p.tone == "watch" for p in adh.points)  # 8 of 28 planned
    assert r.sessions[0].kind == "none" and r.sessions[1].result.startswith("Peak force about 2.6")
    # force-only data: no force section without load cell sessions
    r2 = report.build(patient_id=1, name="Pat", sessions=ss[:6], assessments=[], plan=None, flags=[], now=T0)
    assert "force" not in [s.key for s in r2.sections]
    assert report.to_docx(r, [("Plan", "x")])[:2] == b"PK"  # a .docx is a zip


def test_empty():
    r = report.build(patient_id=1, name="Pat", sessions=[], assessments=[], plan=None, flags=[])
    assert r.status == "insufficient" and r.period == "No sessions yet" and r.sessions == []
