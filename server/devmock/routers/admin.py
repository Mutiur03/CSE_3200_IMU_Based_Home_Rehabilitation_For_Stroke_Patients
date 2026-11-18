"""STUB (wave 0) -> stream A replaces. Admin only: users, doctor assignment, device registration."""
import secrets

from fastapi import APIRouter, Depends

from devmock import fixtures
from schemas import AssignIn, DeviceOut, DeviceRegisterIn, DeviceRegisterOut, UserCreate, UserOut
from security import require_role

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_role("admin"))])


@router.get("/users", response_model=list[UserOut])
def users():
    return list(fixtures.USERS.values())


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate):
    u = UserOut(id=max(fixtures.USERS) + 1, role=body.role, name=body.name, email=body.email)
    fixtures.USERS[u.id] = u
    return u


@router.put("/patients/{patient_id}/doctor", status_code=204)
def assign_doctor(patient_id: int, body: AssignIn):
    return None


@router.get("/devices", response_model=list[DeviceOut])
def devices():
    return [DeviceOut(device_id=d, patient_id=p) for p, d in fixtures.DEVICES.items()]


@router.post("/devices", response_model=DeviceRegisterOut, status_code=201)
def register_device(body: DeviceRegisterIn):
    return DeviceRegisterOut(device_id=body.device_id, device_key=secrets.token_urlsafe(24))
