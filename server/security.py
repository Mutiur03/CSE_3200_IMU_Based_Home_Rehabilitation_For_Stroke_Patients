"""Auth primitives shared by every router: password hashing, JWT cookie, role and patient-access guards.
The JWT carries id/role/name/email, so `current_user` needs no DB hit. FROZEN after wave 0."""
import time

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

import db
from models import Patient
from schemas import UserOut
from settings import get_settings

_ph = PasswordHasher()


def hash_secret(plain: str) -> str:
    return _ph.hash(plain)


def verify_secret(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False


def issue_token(user: UserOut) -> str:
    s = get_settings()
    claims = {**user.model_dump(), "sub": str(user.id), "exp": int(time.time()) + s.jwt_ttl_hours * 3600}
    return jwt.encode(claims, s.jwt_secret, algorithm="HS256")


def set_login_cookie(resp: Response, user: UserOut) -> None:
    s = get_settings()
    resp.set_cookie(s.cookie_name, issue_token(user), max_age=s.jwt_ttl_hours * 3600, httponly=True,
                    samesite="lax", secure=s.cookie_secure, path="/")


def clear_login_cookie(resp: Response) -> None:
    resp.delete_cookie(get_settings().cookie_name, path="/")


def user_from_token(token: str | None) -> UserOut | None:
    """Decode the cookie value. None if missing/expired/forged. Used by HTTP and WebSocket handlers."""
    if not token:
        return None
    try:
        c = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        return UserOut(id=int(c["sub"]), role=c["role"], name=c["name"], email=c["email"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def current_user(request: Request) -> UserOut:
    user = user_from_token(request.cookies.get(get_settings().cookie_name))
    if user is None:
        raise HTTPException(401, "not logged in")
    return user


def require_role(*roles: str):
    """Dependency: `user: UserOut = Depends(require_role("doctor", "admin"))`."""
    def dep(user: UserOut = Depends(current_user)) -> UserOut:
        if user.role not in roles:
            raise HTTPException(403, "forbidden")
        return user
    return dep


def _maybe_db():
    if db.SessionLocal is None:
        yield None
    else:
        with db.SessionLocal() as s:
            yield s


def patient_access(patient_id: int, user: UserOut = Depends(current_user), s: Session | None = Depends(_maybe_db)) -> UserOut:
    """Dependency for routes with a `{patient_id}` path param. patient: only self. doctor: only assigned patients. admin: all.
    Stub mode (no DB): any doctor/admin, patient only self."""
    if user.role == "admin":
        return user
    if user.role == "patient":
        if user.id != patient_id:
            raise HTTPException(403, "forbidden")
        return user
    if s is None:  # stub mode
        return user
    doctor_id = s.scalar(select(Patient.doctor_id).where(Patient.user_id == patient_id))
    if doctor_id != user.id:
        raise HTTPException(403, "forbidden")
    return user
