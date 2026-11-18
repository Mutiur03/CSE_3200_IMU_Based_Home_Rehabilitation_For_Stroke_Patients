"""Admin only: users, doctor assignment, device registration."""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models as m
from db import get_db
from schemas import AssignIn, DeviceOut, DeviceRegisterIn, DeviceRegisterOut, UserCreate, UserOut
from security import hash_secret, require_role

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_role("admin"))])


def _out(u: m.User) -> UserOut:
    return UserOut(id=u.id, role=u.role, name=u.name, email=u.email)


def _check_doctor(s: Session, doctor_id: int):
    if s.scalar(select(m.User.id).where(m.User.id == doctor_id, m.User.role == "doctor")) is None:
        raise HTTPException(422, "doctor_id is not a doctor")


@router.get("/users", response_model=list[UserOut])
def users(s: Session = Depends(get_db)):
    return [_out(u) for u in s.scalars(select(m.User).order_by(m.User.id))]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, s: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if s.scalar(select(m.User.id).where(m.User.email == email)):
        raise HTTPException(409, "email already registered")
    if body.role == "patient" and body.doctor_id is not None:
        _check_doctor(s, body.doctor_id)
    u = m.User(role=body.role, name=body.name, email=email, pw_hash=hash_secret(body.password))
    s.add(u)
    try:
        s.flush()
        if body.role == "patient":
            s.add(m.Patient(user_id=u.id, doctor_id=body.doctor_id, affected_side=body.affected_side, onset_date=body.onset_date))
        s.commit()
    except IntegrityError:  # lost a race on the unique email
        s.rollback()
        raise HTTPException(409, "email already registered")
    return _out(u)


@router.put("/patients/{patient_id}/doctor", status_code=204)
def assign_doctor(patient_id: int, body: AssignIn, s: Session = Depends(get_db)):
    p = s.get(m.Patient, patient_id)
    if p is None:
        raise HTTPException(404, "no such patient")
    _check_doctor(s, body.doctor_id)
    p.doctor_id = body.doctor_id
    s.commit()


@router.get("/devices", response_model=list[DeviceOut])
def devices(s: Session = Depends(get_db)):
    return [DeviceOut(device_id=d.id, patient_id=d.patient_id) for d in s.scalars(select(m.Device).order_by(m.Device.id))]


@router.post("/devices", response_model=DeviceRegisterOut, status_code=201)
def register_device(body: DeviceRegisterIn, s: Session = Depends(get_db)):
    if s.get(m.Device, body.device_id):
        raise HTTPException(409, "device already registered")
    if body.patient_id is not None:
        if s.get(m.Patient, body.patient_id) is None:
            raise HTTPException(404, "no such patient")
        if s.scalar(select(m.Device.id).where(m.Device.patient_id == body.patient_id)):
            raise HTTPException(409, "patient already has a device")
    key = secrets.token_urlsafe(24)
    s.add(m.Device(id=body.device_id, key_hash=hash_secret(key), patient_id=body.patient_id))
    try:
        s.commit()
    except IntegrityError:
        s.rollback()
        raise HTTPException(409, "device id or patient already bound")
    return DeviceRegisterOut(device_id=body.device_id, device_key=key)
