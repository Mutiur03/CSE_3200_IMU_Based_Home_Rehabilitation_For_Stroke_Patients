"""Prescription. GET /api/plan is what the game reads at startup (patient cookie); doctors edit per patient."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as Db

from db import get_db
from models import AuditLog, Plan
from schemas import PlanIn, PlanOut, UserOut
from security import patient_access, require_role

router = APIRouter(prefix="/api", tags=["plans"])


def _out(p: Plan) -> PlanOut:
    return PlanOut(patient_id=p.patient_id, levels_allowed=list(p.levels_allowed), reps_per_level=p.reps_per_level,
                   sessions_per_week=p.sessions_per_week, adapt_on=p.adapt_on, updated_at=p.updated_at)


def _get(s: Db, pid: int) -> PlanOut:
    p = s.get(Plan, pid)
    if p is None:
        raise HTTPException(404, "no plan prescribed yet")
    return _out(p)


@router.get("/plan", response_model=PlanOut)
def my_plan(user: UserOut = Depends(require_role("patient")), s: Db = Depends(get_db)):
    return _get(s, user.id)


@router.get("/patients/{patient_id}/plan", response_model=PlanOut)
def get_plan(patient_id: int, _: UserOut = Depends(patient_access), s: Db = Depends(get_db)):
    return _get(s, patient_id)


@router.put("/patients/{patient_id}/plan", response_model=PlanOut)
def put_plan(patient_id: int, body: PlanIn, _: UserOut = Depends(patient_access), user: UserOut = Depends(require_role("doctor")),
             s: Db = Depends(get_db)):
    lv = body.levels_allowed
    if len(set(lv)) != len(lv) or any(not 1 <= x <= 9 for x in lv):
        raise HTTPException(422, "levels_allowed must be distinct integers in 1..9")
    p = s.get(Plan, patient_id) or Plan(patient_id=patient_id)
    p.levels_allowed, p.reps_per_level, p.sessions_per_week, p.adapt_on = lv, body.reps_per_level, body.sessions_per_week, body.adapt_on
    p.updated_by, p.updated_at = user.id, datetime.now(timezone.utc)
    s.add(p)
    s.add(AuditLog(user_id=user.id, action="update", entity="plan", entity_id=str(patient_id)))
    s.commit()
    return _out(p)
