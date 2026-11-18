"""Platform routers (DB-backed). Mounted by main.py."""
from . import admin, assessments, auth, messages, patients, plans, reports, sessions

ROUTERS = [auth.router, admin.router, patients.router, sessions.router, assessments.router, plans.router, messages.router, reports.router]
