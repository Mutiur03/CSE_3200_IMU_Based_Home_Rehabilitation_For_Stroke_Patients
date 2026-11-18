"""STUB (wave 0) -> stream A (backend core) replaces with DB-backed login. Stub: emails admin@demo / doctor@demo / patient@demo /
patient2@demo with ANY password."""
from fastapi import APIRouter, Depends, HTTPException, Response

import fixtures
from schemas import LoginIn, UserOut
from security import clear_login_cookie, current_user, set_login_cookie

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, resp: Response):
    user = next((u for u in fixtures.USERS.values() if u.email == body.email), None)
    if user is None:
        raise HTTPException(401, "invalid credentials")
    set_login_cookie(resp, user)
    return user


@router.post("/logout", status_code=204)
def logout(resp: Response):
    clear_login_cookie(resp)


@router.get("/me", response_model=UserOut)
def me(user: UserOut = Depends(current_user)):
    return user
