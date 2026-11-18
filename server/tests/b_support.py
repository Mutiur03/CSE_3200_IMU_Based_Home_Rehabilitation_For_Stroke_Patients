"""Shared fixtures for the DB-backed clinical tests. Skipped unless TEST_DATABASE_URL points at a throwaway Postgres
(it is dropped and recreated with Base.metadata.create_all)."""
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import db
import security
from models import Base, Device, Patient, Rep, Session, User
from schemas import UserOut
from settings import get_settings

URL = os.environ.get("TEST_DATABASE_URL")
needs_db = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")

NOW = datetime.now(timezone.utc)


def login(client: TestClient, user: User | None):
    """Authenticate by cookie; None = anonymous."""
    client.cookies.clear()
    if user is not None:
        tok = security.issue_token(UserOut(id=user.id, role=user.role, name=user.name, email=user.email))
        client.cookies.set(get_settings().cookie_name, tok)
    return client


def add_session(s, pid, device, days_ago, quality, duration=10.0, roll=40.0, n_reps=2, raw_file=None, ended=True):
    start = NOW - timedelta(days=days_ago)
    ses = Session(patient_id=pid, device_id=device, started_at=start, ended_at=start + timedelta(minutes=5) if ended else None,
                  n_reps=n_reps, mean_quality=quality, raw_file=raw_file)
    s.add(ses)
    s.flush()
    for i in range(n_reps):
        s.add(Rep(session_id=ses.id, level=1, task="reach", rep=i + 1, duration_s=duration, roll_range_deg=roll, quality=quality))
    return ses


@pytest.fixture
def env(monkeypatch):
    if not URL:
        pytest.skip("TEST_DATABASE_URL not set")
    engine = create_engine(URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    SL = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(db, "SessionLocal", SL)
    from main import app
    with SL() as s:
        u = {}
        for key, role in [("admin", "admin"), ("doc1", "doctor"), ("doc2", "doctor"), ("patA", "patient"), ("patB", "patient")]:
            u[key] = User(role=role, name=key, email=f"{key}@t.io", pw_hash="x")
            s.add(u[key])
        s.flush()
        s.add_all([Patient(user_id=u["patA"].id, doctor_id=u["doc1"].id), Patient(user_id=u["patB"].id, doctor_id=u["doc2"].id)])
        s.flush()
        s.add_all([Device(id="imu_a", key_hash="x", patient_id=u["patA"].id), Device(id="imu_b", key_hash="x", patient_id=u["patB"].id)])
        s.flush()
        # patA: quality 60 x3 then 75 x3; duration 10 -> 8; last session 5 days ago
        for i, (q, d) in enumerate([(60, 10)] * 3 + [(75, 8)] * 3):
            add_session(s, u["patA"].id, "imu_a", 10 - i, q, d)
        # patB: quality 75 x3 then 60 x3 (a drop)
        for i, q in enumerate([75] * 3 + [60] * 3):
            add_session(s, u["patB"].id, "imu_b", 10 - i, q)
        s.commit()
        for x in u.values():
            s.expunge(x)
    with TestClient(app) as c:
        yield SimpleNamespace(client=c, users=u, SL=SL)
    engine.dispose()
