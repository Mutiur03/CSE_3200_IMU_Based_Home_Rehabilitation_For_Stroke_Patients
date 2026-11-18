"""Demo dataset served by the wave-0 stub routers (settings.stub_mode). Lets the frontends be built before the real
routers exist. Streams A/B replace the stubs with DB-backed code; this file is then only used by tests/dev."""
import math
from datetime import date, datetime, timedelta, timezone

from schemas import (AlertRuleIO, AssessmentOut, MessageOut, PlanOut, RepOut, Rubric, SessionDetail, SessionOut, UserOut)

NOW = datetime(2026, 11, 19, 9, 0, tzinfo=timezone.utc)
USERS = {
    1: UserOut(id=1, role="admin", name="Admin", email="admin@demo"),
    2: UserOut(id=2, role="doctor", name="Dr. Rahman", email="doctor@demo"),
    3: UserOut(id=3, role="patient", name="Patient A", email="patient@demo"),
    4: UserOut(id=4, role="patient", name="Patient B", email="patient2@demo"),
}
DEVICES = {3: "imu_01", 4: "imu_02"}
TASKS = {1: "Dial soil", 2: "Plant seed", 3: "Water plant"}  # placeholder names; the real ones come from the game


def _session(sid: int, pid: int, n: int, k: float) -> SessionDetail:
    """k in 0..1 = how far along the improvement trend this session is."""
    start = NOW - timedelta(days=(6 - n) * 7 + (0 if pid == 3 else 2))
    reps = []
    for i in range(9):
        lvl = i // 3 + 1
        reps.append(RepOut(
            id=sid * 100 + i, ts=start + timedelta(minutes=2 * i), level=lvl, task=TASKS[lvl], rep=i % 3 + 1,
            duration_s=round(9 - 2.5 * k + math.sin(i), 2),
            pitch_range_deg=round(18 + 6 * k + i % 3, 1), roll_range_deg=round(28 + 13 * k + i % 4, 1),
            peak_speed_dps=round(60 + 25 * k + 3 * i, 1), speed_peaks=max(1, round(5 - 2 * k + (i % 2))),
            quality=None if i % 3 == 0 else round(62 + 22 * k + 3 * math.sin(i), 1),
            timing_score=None if i % 3 == 0 else round(65 + 20 * k, 1),
            smoothness_score=None if i % 3 == 0 else round(60 + 24 * k, 1)))
    q = [r.quality for r in reps if r.quality is not None]
    m = lambda xs: round(sum(xs) / len(xs), 2)  # noqa: E731
    return SessionDetail(
        id=sid, patient_id=pid, device_id=DEVICES[pid], started_at=start, ended_at=start + timedelta(minutes=20),
        n_reps=len(reps), mean_quality=m(q), dropped_packets=n % 3, sample_rate_hz=99.8,
        mean_duration_s=m([r.duration_s for r in reps]), mean_roll_range_deg=m([r.roll_range_deg for r in reps]),
        mean_pitch_range_deg=m([r.pitch_range_deg for r in reps]), mean_speed_peaks=m([r.speed_peaks for r in reps]), reps=reps)


SESSIONS: dict[int, SessionDetail] = {}
for _n in range(6):
    SESSIONS[10 + _n] = _session(10 + _n, 3, _n, _n / 5)
for _n in range(2):
    SESSIONS[20 + _n] = _session(20 + _n, 4, _n, 0.1 + 0.1 * _n)


def sessions_of(pid: int) -> list[SessionOut]:
    return sorted((SessionOut(**s.model_dump(exclude={"reps"})) for s in SESSIONS.values() if s.patient_id == pid),
                  key=lambda s: s.started_at)


PLANS = {
    p: PlanOut(patient_id=p, levels_allowed=[1, 2, 3], reps_per_level=3, sessions_per_week=3, adapt_on=True, updated_at=NOW)
    for p in (3, 4)
}
ALERTS: dict[int, AlertRuleIO] = {3: AlertRuleIO(max_days_without_session=7, quality_drop_pct=15.0)}
ASSESSMENTS: list[AssessmentOut] = [
    AssessmentOut(id=1, patient_id=3, doctor_id=2, assessed_on=date(2026, 10, 15), rubric=Rubric(range=2, smoothness=2, control=3, adherence=4, overall=2),
                  scale_name="FMA-UE", scale_score=38.0, comment="Baseline visit.", created_at=NOW - timedelta(days=35)),
    AssessmentOut(id=2, patient_id=3, doctor_id=2, assessed_on=date(2026, 11, 12), rubric=Rubric(range=3, smoothness=3, control=4, adherence=5, overall=3),
                  scale_name="FMA-UE", scale_score=44.0, comment="Visible gain in range.", created_at=NOW - timedelta(days=7)),
]
MESSAGES: list[MessageOut] = [
    MessageOut(id=1, patient_id=3, from_user=2, from_name="Dr. Rahman", body="Good progress. Aim for 3 sessions this week.",
               created_at=NOW - timedelta(days=2), read_at=None),
]
