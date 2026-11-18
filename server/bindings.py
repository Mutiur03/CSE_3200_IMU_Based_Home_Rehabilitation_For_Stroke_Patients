"""Sync DB helpers shared by ingest.py and routers/sessions.py (no ingest import, so no cycle)."""
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

import models as m


def device_of(s: DbSession, patient_id: int) -> str | None:
    return s.scalar(select(m.Device.id).where(m.Device.patient_id == patient_id))


def open_session(s: DbSession, patient_id: int) -> m.Session | None:
    return s.scalar(select(m.Session).where(m.Session.patient_id == patient_id, m.Session.ended_at.is_(None))
                    .order_by(m.Session.id.desc()))


def ensure_session(s: DbSession, patient_id: int, device_id: str, raw_file: str | None) -> m.Session:
    """The patient's open session, creating one if none (raw_file = the device's raw log if it has connected)."""
    sess = open_session(s, patient_id)
    if sess is None:
        sess = m.Session(patient_id=patient_id, device_id=device_id, raw_file=raw_file)
        s.add(sess)
        s.commit()
    return sess
