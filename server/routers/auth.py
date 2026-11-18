"""Login (argon2 + JWT cookie), logout, me."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

import models as m
from db import get_db
from schemas import LoginIn, UserOut
from security import clear_login_cookie, current_user, hash_secret, set_login_cookie, verify_secret

router = APIRouter(prefix="/api/auth", tags=["auth"])
_DUMMY = hash_secret("dummy-password")  # verified for unknown emails so response time does not reveal which emails exist


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, resp: Response, s: Session = Depends(get_db)):
    u = s.scalar(select(m.User).where(m.User.email == body.email.strip().lower(), m.User.active.is_(True)))
    ok = verify_secret(body.password, u.pw_hash if u else _DUMMY)
    if u is None or not ok:
        raise HTTPException(401, "invalid credentials")
    user = UserOut(id=u.id, role=u.role, name=u.name, email=u.email)
    s.add(m.AuditLog(user_id=u.id, action="login", entity="user", entity_id=str(u.id)))
    s.commit()
    set_login_cookie(resp, user)
    return user


@router.post("/logout", status_code=204)
def logout(resp: Response):
    clear_login_cookie(resp)


@router.get("/me", response_model=UserOut)
def me(user: UserOut = Depends(current_user)):
    return user
