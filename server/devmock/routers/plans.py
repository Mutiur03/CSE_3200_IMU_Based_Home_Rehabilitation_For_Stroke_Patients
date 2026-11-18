"""STUB (wave 0) -> stream B replaces. GET /api/plan is what the game reads at startup (patient cookie); doctors edit per patient."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from devmock import fixtures
from schemas import PlanIn, PlanOut, UserOut
from security import patient_access, require_role

router = APIRouter(prefix="/api", tags=["plans"])


@router.get("/plan", response_model=PlanOut)
def my_plan(user: UserOut = Depends(require_role("patient"))):
    plan = fixtures.PLANS.get(user.id)
    if plan is None:
        raise HTTPException(404, "no plan prescribed yet")
    return plan


@router.get("/patients/{patient_id}/plan", response_model=PlanOut)
def get_plan(patient_id: int, _: UserOut = Depends(patient_access)):
    plan = fixtures.PLANS.get(patient_id)
    if plan is None:
        raise HTTPException(404, "no plan prescribed yet")
    return plan


@router.put("/patients/{patient_id}/plan", response_model=PlanOut)
def put_plan(patient_id: int, body: PlanIn, _: UserOut = Depends(patient_access), __: UserOut = Depends(require_role("doctor"))):
    fixtures.PLANS[patient_id] = PlanOut(**body.model_dump(), patient_id=patient_id, updated_at=datetime.now(timezone.utc))
    return fixtures.PLANS[patient_id]
