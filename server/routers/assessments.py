"""Doctor marking (rubric 1-5 + optional doctor-administered scale, stored only) and alert rules."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from db import get_db
from models import AlertRule, Assessment, AuditLog
from schemas import AlertRuleIO, AssessmentIn, AssessmentOut, UserOut
from security import patient_access, require_role

router = APIRouter(prefix="/api/patients/{patient_id}", tags=["assessments"])


def _out(a: Assessment) -> AssessmentOut:
    return AssessmentOut(id=a.id, patient_id=a.patient_id, doctor_id=a.doctor_id, assessed_on=a.assessed_on, rubric=a.rubric,
                         scale_name=a.scale_name, scale_score=a.scale_score, comment=a.comment, created_at=a.created_at)


@router.get("/assessments", response_model=list[AssessmentOut])
def list_assessments(patient_id: int, _: UserOut = Depends(patient_access), s: Db = Depends(get_db)):
    rows = s.scalars(select(Assessment).where(Assessment.patient_id == patient_id).order_by(Assessment.assessed_on, Assessment.id))
    return [_out(a) for a in rows]


@router.post("/assessments", response_model=AssessmentOut, status_code=201)
def create_assessment(patient_id: int, body: AssessmentIn, _: UserOut = Depends(patient_access),
                      user: UserOut = Depends(require_role("doctor")), s: Db = Depends(get_db)):
    a = Assessment(patient_id=patient_id, doctor_id=user.id, assessed_on=body.assessed_on, rubric=body.rubric.model_dump(),
                   scale_name=body.scale_name, scale_score=body.scale_score, comment=body.comment)
    s.add(a)
    s.flush()
    s.add(AuditLog(user_id=user.id, action="create", entity="assessment", entity_id=str(a.id)))
    s.commit()
    s.refresh(a)
    return _out(a)


@router.get("/alert-rules", response_model=AlertRuleIO)
def get_alert_rule(patient_id: int, _: UserOut = Depends(patient_access), __: UserOut = Depends(require_role("doctor", "admin")),
                   s: Db = Depends(get_db)):
    r = s.get(AlertRule, patient_id)
    return AlertRuleIO(max_days_without_session=r.max_days_without_session, quality_drop_pct=r.quality_drop_pct) if r else AlertRuleIO()


@router.put("/alert-rules", response_model=AlertRuleIO)
def put_alert_rule(patient_id: int, body: AlertRuleIO, _: UserOut = Depends(patient_access),
                   user: UserOut = Depends(require_role("doctor")), s: Db = Depends(get_db)):
    r = s.get(AlertRule, patient_id) or AlertRule(patient_id=patient_id)
    r.doctor_id, r.max_days_without_session, r.quality_drop_pct = user.id, body.max_days_without_session, body.quality_drop_pct
    s.add(r)
    s.add(AuditLog(user_id=user.id, action="update", entity="alert_rule", entity_id=str(patient_id)))
    s.commit()
    return body
