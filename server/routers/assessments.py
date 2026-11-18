"""STUB (wave 0) -> stream B replaces. Doctor marking (rubric 1-5 + optional doctor-administered scale) and alert rules."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

import fixtures
from schemas import AlertRuleIO, AssessmentIn, AssessmentOut, UserOut
from security import patient_access, require_role

router = APIRouter(prefix="/api/patients/{patient_id}", tags=["assessments"])


@router.get("/assessments", response_model=list[AssessmentOut])
def list_assessments(patient_id: int, _: UserOut = Depends(patient_access)):
    return [a for a in fixtures.ASSESSMENTS if a.patient_id == patient_id]


@router.post("/assessments", response_model=AssessmentOut, status_code=201)
def create_assessment(patient_id: int, body: AssessmentIn, _: UserOut = Depends(patient_access), user: UserOut = Depends(require_role("doctor"))):
    a = AssessmentOut(**body.model_dump(), id=len(fixtures.ASSESSMENTS) + 1, patient_id=patient_id, doctor_id=user.id,
                      created_at=datetime.now(timezone.utc))
    fixtures.ASSESSMENTS.append(a)
    return a


@router.get("/alert-rules", response_model=AlertRuleIO)
def get_alert_rule(patient_id: int, _: UserOut = Depends(patient_access), __: UserOut = Depends(require_role("doctor", "admin"))):
    return fixtures.ALERTS.get(patient_id, AlertRuleIO())


@router.put("/alert-rules", response_model=AlertRuleIO)
def put_alert_rule(patient_id: int, body: AlertRuleIO, _: UserOut = Depends(patient_access), __: UserOut = Depends(require_role("doctor"))):
    fixtures.ALERTS[patient_id] = body
    return body
