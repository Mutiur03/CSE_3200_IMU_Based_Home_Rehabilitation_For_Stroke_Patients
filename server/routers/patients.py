"""Doctor/admin patient list, detail, progress (+ improvement index). Flags come only from the doctor's alert_rules row."""
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session as Db

from db import get_db
from improvement import WINDOW, compute_improvement
from models import AlertRule, Assessment, Device, Patient, Plan, Rep, Session, User
from schemas import (AlertRuleIO, AssessmentOut, PatientDetail, PatientFlag, PatientSummary, PlanOut, Progress, SessionOut,
                     UserOut)
from security import patient_access, require_role

router = APIRouter(prefix="/api/patients", tags=["patients"])


def _sessions(s: Db, pids: list[int]) -> dict[int, list[SessionOut]]:
    """Per-patient sessions in time order with per-session rep means; one query for all patients."""
    q = (select(Session, func.avg(Rep.duration_s), func.avg(Rep.roll_range_deg), func.avg(Rep.pitch_range_deg), func.avg(Rep.speed_peaks), func.avg(Rep.peak_load_kg))
         .outerjoin(Rep, Rep.session_id == Session.id).where(Session.patient_id.in_(pids)).group_by(Session.id)
         .order_by(Session.started_at, Session.id))
    out = defaultdict(list)
    for ses, dur, roll, pitch, sp, load in s.execute(q):
        out[ses.patient_id].append(SessionOut(
            id=ses.id, patient_id=ses.patient_id, device_id=ses.device_id, started_at=ses.started_at, ended_at=ses.ended_at,
            n_reps=ses.n_reps, mean_quality=ses.mean_quality, dropped_packets=ses.dropped_packets, sample_rate_hz=ses.sample_rate_hz,
            mean_duration_s=dur, mean_roll_range_deg=roll, mean_pitch_range_deg=pitch, mean_speed_peaks=sp, mean_peak_load_kg=load))
    return out


def _mean(vals):
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


def _flags(sessions: list[SessionOut], rule: AlertRule | None, created_at: datetime) -> list[PatientFlag]:
    if rule is None:
        return []
    flags = []
    if rule.max_days_without_session is not None:
        since = sessions[-1].started_at if sessions else created_at
        days = (datetime.now(timezone.utc) - since).days
        if days > rule.max_days_without_session:
            flags.append(PatientFlag(kind="no_session", message=f"No session for {days} days (rule: more than {rule.max_days_without_session})"))
    if rule.quality_drop_pct is not None and len(sessions) >= 2 * WINDOW:
        b = _mean(x.mean_quality for x in sessions[:WINDOW])
        c = _mean(x.mean_quality for x in sessions[-WINDOW:])
        if b and c is not None and (b - c) / b * 100 >= rule.quality_drop_pct:
            flags.append(PatientFlag(kind="quality_drop", message=f"Mean quality fell {(b - c) / b * 100:.0f}% vs baseline (rule: {rule.quality_drop_pct:g}%)"))
    return flags


def _summaries(s: Db, pids: list[int]) -> dict[int, tuple[PatientSummary, list[SessionOut]]]:
    users = {u.id: u for u in s.scalars(select(User).where(User.id.in_(pids)))}
    rules = {r.patient_id: r for r in s.scalars(select(AlertRule).where(AlertRule.patient_id.in_(pids)))}
    devs = {d.patient_id: d.id for d in s.scalars(select(Device).where(Device.patient_id.in_(pids)))}
    sess = _sessions(s, pids)
    out = {}
    for pid in pids:
        ss = sess.get(pid, [])
        q = _mean(x.mean_quality for x in ss)
        imp = compute_improvement([x.model_dump() for x in ss])
        out[pid] = (PatientSummary(id=pid, name=users[pid].name, device_id=devs.get(pid), last_session_at=ss[-1].started_at if ss else None,
                                   sessions_total=len(ss), mean_quality=round(q, 1) if q is not None else None, improvement_index=imp.index,
                                   flags=_flags(ss, rules.get(pid), users[pid].created_at)), ss)
    return out


@router.get("", response_model=list[PatientSummary])
def list_patients(user: UserOut = Depends(require_role("doctor", "admin")), s: Db = Depends(get_db)):
    q = select(Patient.user_id).join(User, User.id == Patient.user_id).order_by(User.name, User.id)
    if user.role == "doctor":
        q = q.where(Patient.doctor_id == user.id)
    pids = list(s.scalars(q))
    if not pids:
        return []
    sm = _summaries(s, pids)
    return [sm[p][0] for p in pids]


def _patient_or_404(s: Db, pid: int) -> Patient:
    p = s.get(Patient, pid)
    if p is None:
        raise HTTPException(404, "no such patient")
    return p


@router.get("/{patient_id}", response_model=PatientDetail)
def detail(patient_id: int, _: UserOut = Depends(patient_access), s: Db = Depends(get_db)):
    p = _patient_or_404(s, patient_id)
    summ = _summaries(s, [patient_id])[patient_id][0]
    u, plan, rule = s.get(User, patient_id), s.get(Plan, patient_id), s.get(AlertRule, patient_id)
    return PatientDetail(
        **summ.model_dump(), email=u.email, doctor_id=p.doctor_id, affected_side=p.affected_side, onset_date=p.onset_date, notes=p.notes,
        plan=PlanOut(patient_id=patient_id, levels_allowed=list(plan.levels_allowed), reps_per_level=plan.reps_per_level,
                     sessions_per_week=plan.sessions_per_week, adapt_on=plan.adapt_on, updated_at=plan.updated_at) if plan else None,
        alert_rule=AlertRuleIO(max_days_without_session=rule.max_days_without_session, quality_drop_pct=rule.quality_drop_pct) if rule else None)


@router.get("/{patient_id}/progress", response_model=Progress)
def progress(patient_id: int, _: UserOut = Depends(patient_access), s: Db = Depends(get_db)):
    _patient_or_404(s, patient_id)
    ss = _sessions(s, [patient_id]).get(patient_id, [])
    rows = s.scalars(select(Assessment).where(Assessment.patient_id == patient_id).order_by(Assessment.assessed_on, Assessment.id))
    ass = [AssessmentOut(id=a.id, patient_id=a.patient_id, doctor_id=a.doctor_id, assessed_on=a.assessed_on, rubric=a.rubric,
                         scale_name=a.scale_name, scale_score=a.scale_score, comment=a.comment, created_at=a.created_at) for a in rows]
    return Progress(patient_id=patient_id, sessions=ss, improvement=compute_improvement([x.model_dump() for x in ss]), assessments=ass)
