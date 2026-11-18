"""STUB (wave 0) -> stream B replaces. Doctor <-> patient messages on a patient's thread."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from devmock import fixtures
from schemas import MessageIn, MessageOut, UserOut
from security import patient_access

router = APIRouter(prefix="/api/patients/{patient_id}/messages", tags=["messages"])


@router.get("", response_model=list[MessageOut])
def list_messages(patient_id: int, _: UserOut = Depends(patient_access)):
    return [m for m in fixtures.MESSAGES if m.patient_id == patient_id]


@router.post("", response_model=MessageOut, status_code=201)
def send(patient_id: int, body: MessageIn, user: UserOut = Depends(patient_access)):
    m = MessageOut(id=len(fixtures.MESSAGES) + 1, patient_id=patient_id, from_user=user.id, from_name=user.name, body=body.body,
                   created_at=datetime.now(timezone.utc), read_at=None)
    fixtures.MESSAGES.append(m)
    return m
