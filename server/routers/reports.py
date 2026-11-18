"""Raw-signal replay trace for one session, and CSV export of a patient's reps."""
import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session as Db

import ingest
from db import get_db
from models import Patient, Rep, Session
from orientation import Tilt
from schemas import Trace, TracePoint, UserOut
from security import patient_access, require_role

router = APIRouter(prefix="/api", tags=["reports"])

RATE_HZ = 20.0
WARMUP_MS = 2000


def _raw_path(raw_file: str | None) -> Path:
    """Resolve a session's raw_file to a real file inside RAW_DIR, else 404 (no path traversal)."""
    if not raw_file:
        raise HTTPException(404, "this session has no raw sensor file")
    root = ingest.RAW_DIR.resolve()
    p = Path(raw_file)
    for cand in ([p] if p.is_absolute() else [root / p, root / p.name]):
        try:
            r = cand.resolve()
        except OSError:
            continue
        if r.is_relative_to(root) and r.is_file():
            return r
    raise HTTPException(404, "raw sensor file not found (missing, moved, or outside the raw data directory)")


def _ms(dt: datetime) -> float:
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).timestamp() * 1000


@router.get("/sessions/{session_id}/trace", response_model=Trace)
def trace(session_id: int, user: UserOut = Depends(require_role("doctor", "admin")), s: Db = Depends(get_db)):
    ses = s.get(Session, session_id)
    if ses is None:
        raise HTTPException(404, "no such session")
    if user.role == "doctor" and s.scalar(select(Patient.doctor_id).where(Patient.user_id == ses.patient_id)) != user.id:
        raise HTTPException(403, "forbidden")
    path = _raw_path(ses.raw_file)
    start = _ms(ses.started_at)
    end = _ms(ses.ended_at) if ses.ended_at else datetime.now(timezone.utc).timestamp() * 1000
    tilt, pts, t0, next_t = Tilt(), [], None, None
    step_us = 1e6 / RATE_HZ
    with path.open(encoding="utf-8") as f:  # streamed line by line
        for line in f:
            try:
                b = json.loads(line)
                t = b["server_time_ms"]
                if b.get("device_id", ses.device_id) != ses.device_id or not start - WARMUP_MS <= t <= end:
                    continue
                samples = b["samples"]
            except (ValueError, KeyError, TypeError):
                continue
            live = t >= start
            for x in samples:
                a, g = x["accel"], x["gyro"]
                pitch, roll = tilt.update(x["timestamp"], a["x"], a["y"], a["z"], g["x"], g["y"])
                if not live:
                    continue
                if t0 is None:
                    t0 = next_t = x["timestamp"]
                if x["timestamp"] >= next_t:
                    pts.append(TracePoint(t_s=round((x["timestamp"] - t0) / 1e6, 3), pitch=round(pitch, 2), roll=round(roll, 2)))
                    next_t = x["timestamp"] + step_us
    return Trace(session_id=session_id, rate_hz=RATE_HZ, points=pts)


def _safe(v):
    """Neutralize spreadsheet formula injection in text cells."""
    return "'" + v if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


@router.get("/patients/{patient_id}/reps.csv")
def reps_csv(patient_id: int, _: UserOut = Depends(patient_access), s: Db = Depends(get_db)):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["session_id", "ts", "level", "task", "rep", "duration_s", "pitch_range_deg", "roll_range_deg", "peak_speed_dps", "speed_peaks", "quality"])
    q = select(Rep).join(Session, Session.id == Rep.session_id).where(Session.patient_id == patient_id).order_by(Session.started_at, Session.id, Rep.id)
    for r in s.scalars(q):
        w.writerow([_safe(v) for v in (r.session_id, r.ts.isoformat(), r.level, r.task, r.rep, r.duration_s, r.pitch_range_deg, r.roll_range_deg,
                                       r.peak_speed_dps, r.speed_peaks, r.quality)])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="patient_{patient_id}_reps.csv"'})
