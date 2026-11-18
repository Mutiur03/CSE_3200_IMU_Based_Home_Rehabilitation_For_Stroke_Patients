"""Standalone demo API with fixture data and NO database, for UI design work only (never deployed).
Run from server/:  python -m uvicorn devmock.app:app --port 18300
Logins (any password): admin@demo, doctor@demo, patient@demo (id 3), patient2@demo (id 4)."""
from fastapi import FastAPI

from devmock.routers import admin, assessments, auth, messages, patients, plans, reports, sessions

app = FastAPI(title="Arc devmock")
for m in (auth, admin, patients, sessions, assessments, plans, messages, reports):
    app.include_router(m.router)
