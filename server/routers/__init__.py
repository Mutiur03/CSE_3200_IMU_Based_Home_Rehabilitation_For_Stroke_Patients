"""Platform routers. Wave 0: every file is a STUB serving fixtures.py (settings.stub_mode). Each stream replaces its own files."""
from . import admin, assessments, auth, messages, patients, plans, reports, sessions

ROUTERS = [auth.router, admin.router, patients.router, sessions.router, assessments.router, plans.router, messages.router, reports.router]
