"""Shared fixture for DB-backed tests. Skipped unless TEST_DATABASE_URL points at a throwaway Postgres, e.g.
docker run -d --name imu_pg_a -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=t -p 15441:5432 postgres:16-alpine
TEST_DATABASE_URL=postgresql+psycopg://postgres:pw@127.0.0.1:15441/t"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import conftest  # noqa: F401  (env + UDP stand-in must be set up before server imports)
import db
import ingest
import main
from models import Base

URL = os.environ.get("TEST_DATABASE_URL")
needs_db = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")
PW = "correct-horse-1"


def batch(device_id, seq, t0=0, ax=0.0, n=10):
    return {"device_id": device_id, "seq": seq, "samples": [
        {"timestamp": t0 + i * 10_000, "accel": {"x": ax, "y": 0.0, "z": 1.0}, "gyro": {"x": 0.1, "y": 0.0, "z": -0.1}}
        for i in range(n)]}


class Env:
    """One TestClient (one event loop, so device WS -> game WS broadcast works). Identity is passed per request as a Cookie
    header, so several users can act in the same test."""

    def __init__(self, client, SessionLocal):
        self.c, self.SessionLocal = client, SessionLocal
        self._cookies = {}
        self.admin = self.login("admin@t", seed=("admin", "Admin"))

    def login(self, email, password=PW, seed=None):
        if seed:  # bootstrap: insert directly (no admin exists yet)
            import models as m
            from security import hash_secret
            with self.SessionLocal() as s:
                s.add(m.User(email=email, role=seed[0], name=seed[1], pw_hash=hash_secret(password)))
                s.commit()
        r = self.c.post("/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        tok = r.cookies.get("session")
        self.c.cookies.clear()
        self._cookies[email] = {"Cookie": f"session={tok}"}
        return self._cookies[email]

    def make_user(self, role, email, name=None, **extra):
        r = self.c.post("/api/admin/users", headers=self.admin, json={"role": role, "name": name or email, "email": email, "password": PW, **extra})
        assert r.status_code == 201, r.text
        return r.json()["id"], self.login(email)

    def make_device(self, device_id, patient_id=None):
        r = self.c.post("/api/admin/devices", headers=self.admin, json={"device_id": device_id, "patient_id": patient_id})
        assert r.status_code == 201, r.text
        return r.json()["device_key"]

    def post_batch(self, device_id, key, seq, **kw):
        return self.c.post("/api/imu", json=batch(device_id, seq, **kw), headers={"X-Device-Key": key})

    def game_event(self, who, level=1, rep=1, reps_required=3, task="t"):
        return self.c.post("/api/game_event", headers=who, json={"device_id": "ignored", "level": level, "task": task, "rep": rep,
                                                                  "reps_required": reps_required, "duration_s": 2.0})


@pytest.fixture
def env(monkeypatch):
    if not URL:
        pytest.skip("TEST_DATABASE_URL not set")
    engine = create_engine(URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    SL = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(db, "SessionLocal", SL)
    ingest.devices.clear()
    ingest._verified.clear()
    ingest.game_clients.clear()
    invalid0 = ingest.invalid_packets
    with TestClient(main.app) as client:
        yield Env(client, SL)
    engine.dispose()
    ingest.invalid_packets = invalid0
    # drain the UDP stand-in for the game so later tests (test_ingest) don't read our datagrams
    conftest.game.settimeout(0.05)
    try:
        while True:
            conftest.game.recv(4096)
    except OSError:
        pass
    conftest.game.settimeout(2)
