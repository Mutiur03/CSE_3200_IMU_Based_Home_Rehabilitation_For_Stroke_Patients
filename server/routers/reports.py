"""STUB (wave 0) -> stream B replaces. Raw-signal replay trace for one session, and CSV export of a patient's reps."""
import csv
import io
import math

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

import fixtures
from schemas import Trace, TracePoint, UserOut
from security import patient_access, require_role

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/sessions/{session_id}/trace", response_model=Trace)
def trace(session_id: int, _: UserOut = Depends(require_role("doctor", "admin"))):
    if session_id not in fixtures.SESSIONS:
        raise HTTPException(404, "no such session")
    pts = [TracePoint(t_s=i / 20, pitch=10 * math.sin(i / 15), roll=25 * math.sin(i / 25)) for i in range(20 * 60)]
    return Trace(session_id=session_id, rate_hz=20.0, points=pts)


@router.get("/patients/{patient_id}/reps.csv")
def reps_csv(patient_id: int, _: UserOut = Depends(patient_access)):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["session_id", "ts", "level", "task", "rep", "duration_s", "pitch_range_deg", "roll_range_deg", "peak_speed_dps", "speed_peaks", "quality"])
    for s in fixtures.SESSIONS.values():
        if s.patient_id == patient_id:
            for r in s.reps:
                w.writerow([s.id, r.ts.isoformat(), r.level, r.task, r.rep, r.duration_s, r.pitch_range_deg, r.roll_range_deg, r.peak_speed_dps, r.speed_peaks, r.quality])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="patient_{patient_id}_reps.csv"'})
