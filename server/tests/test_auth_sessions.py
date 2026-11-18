"""Stream A: auth, admin, sessions, device keys, per-patient game feed. Needs TEST_DATABASE_URL (see a_support.py)."""
import pytest
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

import ingest
import models as m
from a_support import PW, Env, batch, env, needs_db  # noqa: F401

pytestmark = needs_db


def test_login(env: Env):
    uid, _ = env.make_user("doctor", "d@t")
    assert env.c.post("/api/auth/login", json={"email": "d@t", "password": "wrong-password"}).status_code == 401
    assert env.c.post("/api/auth/login", json={"email": "nobody@t", "password": PW}).status_code == 401
    r = env.c.post("/api/auth/login", json={"email": "D@t", "password": PW})
    assert r.status_code == 200 and r.json()["id"] == uid
    assert env.c.get("/api/auth/me").json()["email"] == "d@t"  # cookie jar now holds it
    with env.SessionLocal() as s:
        assert s.scalar(select(m.AuditLog.id).where(m.AuditLog.user_id == uid, m.AuditLog.action == "login"))
        s.execute(m.User.__table__.update().where(m.User.id == uid).values(active=False))
        s.commit()
    env.c.cookies.clear()
    assert env.c.post("/api/auth/login", json={"email": "d@t", "password": PW}).status_code == 401


def test_admin_users_devices(env: Env):
    did, dh = env.make_user("doctor", "d@t")
    pid, ph = env.make_user("patient", "p@t", doctor_id=did, affected_side="left")
    dup = env.c.post("/api/admin/users", headers=env.admin, json={"role": "doctor", "name": "x", "email": "P@t", "password": PW})
    assert dup.status_code == 409
    assert env.c.post("/api/admin/users", headers=ph, json={"role": "doctor", "name": "x", "email": "z@t", "password": PW}).status_code == 403
    bad = env.c.post("/api/admin/users", headers=env.admin, json={"role": "patient", "name": "x", "email": "q@t", "password": PW, "doctor_id": pid})
    assert bad.status_code == 422  # doctor_id must be a doctor
    assert len(env.c.get("/api/admin/users", headers=env.admin).json()) == 3
    key = env.make_device("imu_a", pid)
    with env.SessionLocal() as s:
        d = s.get(m.Device, "imu_a")
        assert d.key_hash != key and d.key_hash.startswith("$argon2") and d.patient_id == pid
        assert s.get(m.Patient, pid).doctor_id == did
    assert env.c.post("/api/admin/devices", headers=env.admin, json={"device_id": "imu_b", "patient_id": pid}).status_code == 409
    assert env.c.post("/api/admin/devices", headers=env.admin, json={"device_id": "imu_a"}).status_code == 409
    assert [d["device_id"] for d in env.c.get("/api/admin/devices", headers=env.admin).json()] == ["imu_a"]
    did2, _ = env.make_user("doctor", "d2@t")
    assert env.c.put(f"/api/admin/patients/{pid}/doctor", headers=env.admin, json={"doctor_id": did2}).status_code == 204
    with env.SessionLocal() as s:
        assert s.get(m.Patient, pid).doctor_id == did2


def _patient(env, email, dev, doctor_id=None):
    pid, h = env.make_user("patient", email, doctor_id=doctor_id)
    return pid, h, env.make_device(dev, pid)


def test_session_flow(env: Env):
    did, dh = env.make_user("doctor", "d@t")
    pid, ph, key = _patient(env, "p@t", "imu_x", did)
    assert env.c.post("/api/sessions/start", headers=env.make_user("patient", "nodev@t")[1]).status_code == 409
    assert env.post_batch("imu_x", key, 0).status_code == 200
    s1 = env.c.post("/api/sessions/start", headers=ph).json()
    s2 = env.c.post("/api/sessions/start", headers=ph).json()
    assert s1["id"] == s2["id"]
    assert env.c.get("/api/sessions/current", headers=ph).json()["id"] == s1["id"]
    with env.SessionLocal() as s:
        assert s.get(m.Session, s1["id"]).raw_file == str(ingest.devices["imu_x"].path)
    for i in (1, 2, 3):
        r = env.game_event(ph, rep=i)
        assert r.status_code == 200, r.text
        assert r.json()["rep"] == i
    with env.SessionLocal() as s:
        assert s.query(m.Rep).filter_by(session_id=s1["id"]).count() == 3
    done = env.c.post("/api/sessions/end", headers=ph).json()
    assert done["n_reps"] == 3 and done["ended_at"] and done["mean_duration_s"] == 2.0
    assert done["dropped_packets"] is None  # device not connected over WS
    assert env.c.get("/api/sessions/current", headers=ph).json() is None
    lst = env.c.get(f"/api/patients/{pid}/sessions", headers=dh).json()
    assert [x["id"] for x in lst] == [s1["id"]] and lst[0]["mean_duration_s"] == 2.0
    det = env.c.get(f"/api/sessions/{s1['id']}", headers=ph).json()
    assert len(det["reps"]) == 3 and det["reps"][0]["quality"] is None
    # a rep with no open session auto-opens one
    assert env.game_event(ph, level=2, rep=1).status_code == 200
    assert env.c.get("/api/sessions/current", headers=ph).json()["id"] != s1["id"]


def test_level_mapping(env: Env):
    pid, ph, key = _patient(env, "p@t", "imu_x")
    env.post_batch("imu_x", key, 0)
    with env.SessionLocal() as s:
        s.add(m.Plan(patient_id=pid, levels_allowed=[4, 5], reps_per_level=1, sessions_per_week=3, adapt_on=True))
        s.commit()
    r = env.game_event(ph, level=1, rep=1, reps_required=1).json()
    assert r["next_level"] == 4 and r["adapt"] is True  # no quality yet -> up (2) -> nearest allowed >= 2
    with env.SessionLocal() as s:
        p = s.get(m.Plan, pid)
        p.adapt_on, p.levels_allowed = False, [3, 5]
        s.commit()
    r = env.game_event(ph, level=9, rep=1, reps_required=1).json()
    assert r["next_level"] == 3 and r["adapt"] is False  # fixed progression 9 -> 1, wraps to lowest allowed
    # no plan / lab cookie-less event keeps old behaviour
    assert ingest.map_level(2, 5, [1, 4]) == 1 and ingest.map_level(8, 5, [1, 4]) == 1 and ingest.map_level(3, 3, [3]) == 3
    assert ingest.map_level(1, 9, [2, 6]) == 2


def test_ws_game_isolation(env: Env):
    _, hx, kx = _patient(env, "x@t", "imu_x")
    _, hy, ky = _patient(env, "y@t", "imu_y")
    with env.c.websocket_connect("/ws/game", headers=hx) as wx, env.c.websocket_connect("/ws/game", headers=hy) as wy:
        assert env.post_batch("imu_x", kx, 0, ax=0.0).status_code == 200
        assert env.post_batch("imu_y", ky, 0, ax=-0.5).status_code == 200
        px, py = wx.receive_json()["pitch"], wy.receive_json()["pitch"]
        assert abs(px) < 1 and 20 < py < 40  # each got only its own device (X flat, Y tilted)
    # doctor / anonymous are refused
    _, hd = env.make_user("doctor", "d@t")
    for h in (hd, {}):
        with env.c.websocket_connect("/ws/game", headers=h) as w:
            with pytest.raises(WebSocketDisconnect) as e:
                w.receive_json()
            assert e.value.code == 1008


def test_device_key(env: Env):
    pid, _, key = _patient(env, "p@t", "imu_x")
    url = "/api/imu"
    assert env.c.post(url, json=batch("imu_x", 0)).status_code == 401
    assert env.c.post(url, json=batch("imu_x", 0), headers={"X-Device-Key": "wrong"}).status_code == 401
    assert env.c.post(url, json=batch("imu_nope", 0), headers={"X-Device-Key": key}).status_code == 401
    assert env.post_batch("imu_x", key, 0).status_code == 200
    with env.c.websocket_connect("/ws/imu") as w:
        w.send_json(batch("imu_x", 1))
        assert w.receive_json() == {"error": "unauthorized"}
        with pytest.raises(WebSocketDisconnect) as e:
            w.receive_json()
        assert e.value.code == 1008
    with env.c.websocket_connect("/ws/imu", headers={"X-Device-Key": key}) as w:
        w.send_json(batch("imu_x", 2, t0=10_000_000))
        w.send_json({"bad": 1})
        assert "error" in w.receive_json()  # validation error, not unauthorized
        assert ingest.devices["imu_x"].packets == 2


def test_session_access(env: Env):
    d1, h1 = env.make_user("doctor", "d1@t")
    d2, h2 = env.make_user("doctor", "d2@t")
    p1, hp1, k1 = _patient(env, "p1@t", "imu_1", d1)
    p2, hp2, k2 = _patient(env, "p2@t", "imu_2", d1)
    env.post_batch("imu_1", k1, 0)
    sid = env.c.post("/api/sessions/start", headers=hp1).json()["id"]
    assert env.c.get(f"/api/sessions/{sid}", headers=h1).status_code == 200
    assert env.c.get(f"/api/sessions/{sid}", headers=env.admin).status_code == 200
    assert env.c.get(f"/api/sessions/{sid}", headers=h2).status_code in (403, 404)  # unassigned doctor
    assert env.c.get(f"/api/sessions/{sid}", headers=hp2).status_code in (403, 404)  # other patient
    assert env.c.get(f"/api/sessions/99999", headers=h1).status_code == 404
    assert env.c.get(f"/api/patients/{p1}/sessions", headers=h2).status_code == 403
    assert env.c.get(f"/api/patients/{p1}/sessions", headers=hp2).status_code == 403
    assert env.c.get(f"/api/patients/{p1}/sessions", headers=h1).status_code == 200
    assert env.c.post("/api/sessions/start", headers=h1).status_code == 403
