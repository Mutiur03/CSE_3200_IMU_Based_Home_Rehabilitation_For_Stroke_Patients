"""Doctor <-> patient messages on a patient's thread."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from db import get_db
from models import Message, User
from schemas import MessageIn, MessageOut, UserOut
from security import patient_access

router = APIRouter(prefix="/api/patients/{patient_id}/messages", tags=["messages"])


def _out(m: Message, name: str) -> MessageOut:
    return MessageOut(id=m.id, patient_id=m.patient_id, from_user=m.from_user, from_name=name, body=m.body, created_at=m.created_at,
                      read_at=m.read_at)


@router.get("", response_model=list[MessageOut])
def list_messages(patient_id: int, user: UserOut = Depends(patient_access), s: Db = Depends(get_db)):
    rows = s.execute(select(Message, User.name).join(User, User.id == Message.from_user).where(Message.patient_id == patient_id)
                     .order_by(Message.created_at, Message.id)).all()
    if user.role != "admin":  # an admin looking in is not a recipient
        now = datetime.now(timezone.utc)
        unread = [m for m, _ in rows if m.from_user != user.id and m.read_at is None]
        for m in unread:
            m.read_at = now
        if unread:
            s.commit()
    return [_out(m, n) for m, n in rows]


@router.post("", response_model=MessageOut, status_code=201)
def send(patient_id: int, body: MessageIn, user: UserOut = Depends(patient_access), s: Db = Depends(get_db)):
    m = Message(patient_id=patient_id, from_user=user.id, body=body.body)
    s.add(m)
    s.commit()
    s.refresh(m)
    return _out(m, user.name)
