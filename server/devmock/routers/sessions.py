"""STUB (wave 0) -> stream A replaces. Start/end a play session (binds the patient's device), list and read sessions.
Real version: start opens a `sessions` row for the patient's device and stores the device's raw log path; ingest.game_event then
writes reps into it."""
from fastapi import APIRouter, Depends, HTTPException

from devmock import fixtures
from schemas import SessionDetail, SessionOut, UserOut
from security import patient_access, require_role

router = APIRouter(prefix="/api", tags=["sessions"])


@router.post("/sessions/start", response_model=SessionOut, status_code=201)
def start(user: UserOut = Depends(require_role("patient"))):
    return fixtures.sessions_of(user.id)[-1].model_copy(update={"id": 999, "ended_at": None, "n_reps": 0, "mean_quality": None})


@router.post("/sessions/end", response_model=SessionOut)
def end(user: UserOut = Depends(require_role("patient"))):
    return fixtures.sessions_of(user.id)[-1]


@router.get("/sessions/current", response_model=SessionOut | None)
def current(user: UserOut = Depends(require_role("patient"))):
    return None


@router.get("/patients/{patient_id}/sessions", response_model=list[SessionOut])
def list_sessions(patient_id: int, _: UserOut = Depends(patient_access)):
    return fixtures.sessions_of(patient_id)


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def session_detail(session_id: int, user: UserOut = Depends(require_role("patient", "doctor", "admin"))):
    s = fixtures.SESSIONS.get(session_id)
    if s is None or (user.role == "patient" and s.patient_id != user.id):
        raise HTTPException(404, "no such session")
    return s
