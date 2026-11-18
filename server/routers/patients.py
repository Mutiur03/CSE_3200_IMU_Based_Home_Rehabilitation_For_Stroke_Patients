"""STUB (wave 0) -> stream B (backend clinical) replaces. Doctor/admin patient list, detail, progress (+ improvement index)."""
from datetime import timedelta

from fastapi import APIRouter, Depends

import fixtures
from schemas import Improvement, MetricChange, PatientDetail, PatientFlag, PatientSummary, Progress, UserOut
from security import patient_access, require_role

router = APIRouter(prefix="/api/patients", tags=["patients"])

# metric -> (SessionOut field, higher_is_better)
_METRICS = {"roll_range": ("mean_roll_range_deg", True), "pitch_range": ("mean_pitch_range_deg", True),
            "duration": ("mean_duration_s", False), "speed_peaks": ("mean_speed_peaks", False), "quality": ("mean_quality", True)}


def _improvement(sessions) -> Improvement:
    if len(sessions) < 6:  # needs separate baseline (first 3) and current (last 3) windows
        return Improvement(baseline_sessions=min(3, len(sessions)), current_sessions=0, metrics=[], index=None)
    first, last = sessions[:3], sessions[-3:]
    med = lambda ss, f: sorted(getattr(s, f) for s in ss)[1]  # noqa: E731
    out = []
    for name, (field, up) in _METRICS.items():
        b, c = med(first, field), med(last, field)
        pct = (c - b) / b * 100 * (1 if up else -1)
        out.append(MetricChange(name=name, baseline=b, current=c, improvement_pct=round(pct, 1)))
    return Improvement(baseline_sessions=3, current_sessions=3, metrics=out, index=round(sum(m.improvement_pct for m in out) / len(out), 1))


def _summary(pid: int) -> PatientSummary:
    ss = fixtures.sessions_of(pid)
    q = [s.mean_quality for s in ss if s.mean_quality is not None]
    flags = []
    if ss and fixtures.NOW - ss[-1].started_at > timedelta(days=7):
        flags.append(PatientFlag(kind="no_session", message="No session for more than 7 days"))
    return PatientSummary(id=pid, name=fixtures.USERS[pid].name, device_id=fixtures.DEVICES.get(pid),
                          last_session_at=ss[-1].started_at if ss else None, sessions_total=len(ss),
                          mean_quality=round(sum(q) / len(q), 1) if q else None, improvement_index=_improvement(ss).index, flags=flags)


@router.get("", response_model=list[PatientSummary])
def list_patients(_: UserOut = Depends(require_role("doctor", "admin"))):
    return [_summary(p) for p in fixtures.DEVICES]


@router.get("/{patient_id}", response_model=PatientDetail)
def detail(patient_id: int, _: UserOut = Depends(patient_access)):
    return PatientDetail(**_summary(patient_id).model_dump(), email=fixtures.USERS[patient_id].email, doctor_id=2, affected_side="right",
                         onset_date=None, notes=None, plan=fixtures.PLANS.get(patient_id), alert_rule=fixtures.ALERTS.get(patient_id))


@router.get("/{patient_id}/progress", response_model=Progress)
def progress(patient_id: int, _: UserOut = Depends(patient_access)):
    ss = fixtures.sessions_of(patient_id)
    return Progress(patient_id=patient_id, sessions=ss, improvement=_improvement(ss),
                    assessments=[a for a in fixtures.ASSESSMENTS if a.patient_id == patient_id])
