"""Start/end a play session (binds the patient's device), list and read sessions. ingest.game_event writes reps into the open one."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Float, cast, func, select
from sqlalchemy.orm import Session

import bindings
import ingest
import models as m
from db import get_db
from schemas import RepOut, SessionDetail, SessionOut, UserOut
from security import patient_access, require_role

router = APIRouter(prefix="/api", tags=["sessions"])

_MEANS = (func.avg(m.Rep.duration_s), func.avg(m.Rep.roll_range_deg), func.avg(m.Rep.pitch_range_deg), cast(func.avg(m.Rep.speed_peaks), Float))


def _out(sess: m.Session, means=(None,) * 4) -> SessionOut:
    return SessionOut.model_validate(sess, from_attributes=True).model_copy(update=dict(zip(
        ("mean_duration_s", "mean_roll_range_deg", "mean_pitch_range_deg", "mean_speed_peaks"), means)))


@router.post("/sessions/start", response_model=SessionOut, status_code=201)
def start(user: UserOut = Depends(require_role("patient")), s: Session = Depends(get_db)):
    did = bindings.device_of(s, user.id)
    if did is None:
        raise HTTPException(409, "no device bound to this patient")
    dev = ingest.devices.get(did)
    return _out(bindings.ensure_session(s, user.id, did, str(dev.path) if dev else None))


@router.post("/sessions/end", response_model=SessionOut)
def end(user: UserOut = Depends(require_role("patient")), s: Session = Depends(get_db)):
    sess = bindings.open_session(s, user.id)
    if sess is None:
        raise HTTPException(409, "no open session")
    n, q, *means = s.execute(select(func.count(m.Rep.id), func.avg(m.Rep.quality), *_MEANS).where(m.Rep.session_id == sess.id)).one()
    dev = ingest.devices.get(sess.device_id)
    st = dev.stats() if dev and dev.connected else {}
    sess.ended_at = datetime.now(timezone.utc)
    sess.n_reps, sess.mean_quality = n, q
    sess.dropped_packets, sess.sample_rate_hz = st.get("dropped_packets"), st.get("sample_rate_hz")
    s.commit()
    return _out(sess, means)


@router.get("/sessions/current", response_model=SessionOut | None)
def current(user: UserOut = Depends(require_role("patient")), s: Session = Depends(get_db)):
    sess = bindings.open_session(s, user.id)
    return _out(sess) if sess else None


@router.get("/patients/{patient_id}/sessions", response_model=list[SessionOut])
def list_sessions(patient_id: int, _: UserOut = Depends(patient_access), s: Session = Depends(get_db)):
    q = (select(m.Session, *_MEANS).outerjoin(m.Rep, m.Rep.session_id == m.Session.id)
         .where(m.Session.patient_id == patient_id).group_by(m.Session.id).order_by(m.Session.started_at, m.Session.id))
    return [_out(row[0], row[1:]) for row in s.execute(q)]


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def session_detail(session_id: int, user: UserOut = Depends(require_role("patient", "doctor", "admin")), s: Session = Depends(get_db)):
    sess = s.get(m.Session, session_id)
    if sess is None or (user.role == "patient" and sess.patient_id != user.id):
        raise HTTPException(404, "no such session")
    if user.role == "doctor" and s.scalar(select(m.Patient.doctor_id).where(m.Patient.user_id == sess.patient_id)) != user.id:
        raise HTTPException(404, "no such session")
    reps = list(s.scalars(select(m.Rep).where(m.Rep.session_id == session_id).order_by(m.Rep.ts, m.Rep.id)))
    means = s.execute(select(*_MEANS).where(m.Rep.session_id == session_id)).one()
    return SessionDetail(**_out(sess, means).model_dump(), reps=[RepOut.model_validate(r, from_attributes=True) for r in reps])
