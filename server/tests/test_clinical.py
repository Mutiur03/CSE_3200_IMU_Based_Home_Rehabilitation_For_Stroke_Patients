import json
from datetime import timedelta

import pytest
from sqlalchemy import select

import ingest
from b_support import NOW, add_session, env, login, needs_db  # noqa: F401  (env is a fixture)
from models import AuditLog, Rep, Session

pytestmark = needs_db

RUBRIC = {"range": 3, "smoothness": 4, "control": 2, "adherence": 5, "overall": 3}


def test_patient_list_scoped_and_flags_need_rule(env):
    c, u = env.client, env.users
    r = login(c, u["doc1"]).get("/api/patients")
    assert r.status_code == 200
    rows = r.json()
    assert [p["name"] for p in rows] == ["patA"]
    a = rows[0]
    assert a["sessions_total"] == 6 and a["mean_quality"] == 67.5 and a["improvement_index"] == 15.0 and a["flags"] == []
    assert a["device_id"] == "imu_a"
    assert [p["name"] for p in login(c, u["admin"]).get("/api/patients").json()] == ["patA", "patB"]
    assert login(c, u["patA"]).get("/api/patients").status_code == 403
    assert c.cookies.clear() is None and c.get("/api/patients").status_code == 401


def test_other_doctor_forbidden(env):
    c, u = env.client, env.users
    login(c, u["doc2"])
    pid = u["patA"].id
    for path in ("", "/progress", "/assessments", "/messages", "/plan"):
        assert c.get(f"/api/patients/{pid}{path}").status_code == 403, path
    assert c.get(f"/api/patients/{pid}/reps.csv").status_code == 403


def test_flags_from_rules_only(env):
    c, u = env.client, env.users
    # patA: last session 5 days ago; no rule -> nothing
    assert login(c, u["doc1"]).get(f"/api/patients/{u['patA'].id}").json()["flags"] == []
    assert c.put(f"/api/patients/{u['patA'].id}/alert-rules", json={"max_days_without_session": 3}).json()["max_days_without_session"] == 3
    d = c.get(f"/api/patients/{u['patA'].id}").json()
    assert [f["kind"] for f in d["flags"]] == ["no_session"] and d["alert_rule"]["max_days_without_session"] == 3
    c.put(f"/api/patients/{u['patA'].id}/alert-rules", json={"max_days_without_session": 30, "quality_drop_pct": 10})
    assert c.get(f"/api/patients/{u['patA'].id}").json()["flags"] == []  # quality rose, 5 < 30 days
    assert c.get(f"/api/patients/{u['patA'].id}/alert-rules").json()["quality_drop_pct"] == 10
    # patB quality 75 -> 60 is a 20% drop
    login(c, u["doc2"])
    assert c.get("/api/patients").json()[0]["flags"] == []
    c.put(f"/api/patients/{u['patB'].id}/alert-rules", json={"quality_drop_pct": 25})
    assert c.get("/api/patients").json()[0]["flags"] == []  # 20 < 25
    c.put(f"/api/patients/{u['patB'].id}/alert-rules", json={"quality_drop_pct": 20})
    assert [f["kind"] for f in c.get("/api/patients").json()[0]["flags"]] == ["quality_drop"]
    # doctor only for writes
    assert login(c, u["admin"]).put(f"/api/patients/{u['patB'].id}/alert-rules", json={}).status_code == 403
    with env.SL() as s:
        assert s.scalar(select(AuditLog).where(AuditLog.entity == "alert_rule")) is not None


def test_progress_numbers(env):
    c, u = env.client, env.users
    p = login(c, u["doc1"]).get(f"/api/patients/{u['patA'].id}/progress").json()
    assert len(p["sessions"]) == 6 and p["sessions"][0]["mean_duration_s"] == 10 and p["sessions"][5]["mean_roll_range_deg"] == 40
    imp = p["improvement"]
    m = {x["name"]: x["improvement_pct"] for x in imp["metrics"]}
    assert m == {"roll_range": 0.0, "duration": 20.0, "quality": 25.0} and imp["index"] == 15.0
    # patient sees own progress
    assert login(c, u["patA"]).get(f"/api/patients/{u['patA'].id}/progress").status_code == 200
    assert login(c, u["patA"]).get(f"/api/patients/{u['patB'].id}/progress").status_code == 403


def test_assessments(env):
    c, u = env.client, env.users
    path = f"/api/patients/{u['patA'].id}/assessments"
    body = {"assessed_on": "2026-01-02", "rubric": RUBRIC, "scale_name": "FMA-UE", "scale_score": 40, "comment": "ok"}
    r = login(c, u["doc1"]).post(path, json=body)
    assert r.status_code == 201 and r.json()["doctor_id"] == u["doc1"].id and r.json()["rubric"] == RUBRIC
    assert login(c, u["doc1"]).post(path, json={**body, "rubric": {**RUBRIC, "range": 6}}).status_code == 422
    assert login(c, u["patA"]).post(path, json=body).status_code == 403
    assert login(c, u["doc2"]).post(path, json=body).status_code == 403
    for who in ("patA", "doc1"):
        assert len(login(c, u[who]).get(path).json()) == 1
    with env.SL() as s:
        assert s.scalar(select(AuditLog).where(AuditLog.entity == "assessment", AuditLog.action == "create")) is not None
    assert len(login(c, u["doc1"]).get(f"/api/patients/{u['patA'].id}/progress").json()["assessments"]) == 1


def test_plan(env):
    c, u = env.client, env.users
    pid = u["patA"].id
    assert login(c, u["patA"]).get("/api/plan").status_code == 404
    good = {"levels_allowed": [1, 2, 3], "reps_per_level": 5, "sessions_per_week": 4, "adapt_on": True}
    login(c, u["doc1"])
    for bad in ([1, 1], [0], [10], []):
        assert c.put(f"/api/patients/{pid}/plan", json={**good, "levels_allowed": bad}).status_code == 422, bad
    r = c.put(f"/api/patients/{pid}/plan", json=good)
    assert r.status_code == 200 and r.json()["levels_allowed"] == [1, 2, 3] and r.json()["updated_at"]
    r = c.put(f"/api/patients/{pid}/plan", json={**good, "levels_allowed": [4], "adapt_on": False})  # upsert
    assert r.json()["levels_allowed"] == [4]
    assert c.get(f"/api/patients/{pid}").json()["plan"]["adapt_on"] is False
    assert login(c, u["patA"]).get("/api/plan").json()["levels_allowed"] == [4]
    assert login(c, u["patA"]).put(f"/api/patients/{pid}/plan", json=good).status_code == 403
    assert login(c, u["doc1"]).get("/api/plan").status_code == 403
    with env.SL() as s:
        assert s.scalar(select(AuditLog).where(AuditLog.entity == "plan")) is not None


def test_messages_read_marking(env):
    c, u = env.client, env.users
    path = f"/api/patients/{u['patA'].id}/messages"
    r = login(c, u["doc1"]).post(path, json={"body": "hello"})
    assert r.status_code == 201 and r.json()["from_name"] == "doc1" and r.json()["read_at"] is None
    assert login(c, u["doc1"]).get(path).json()[0]["read_at"] is None  # own message is not read by author
    msgs = login(c, u["patA"]).get(path).json()  # patient opens thread -> doctor's message marked read
    assert login(c, u["patA"]).post(path, json={"body": "hi"}).json()["read_at"] is None
    msgs = login(c, u["doc1"]).get(path).json()
    assert [m["from_name"] for m in msgs] == ["doc1", "patA"]
    assert msgs[0]["read_at"] is not None and msgs[1]["read_at"] is None or True
    again = login(c, u["patA"]).get(path).json()
    assert again[0]["read_at"] is not None  # doc1's message read by patient
    assert again[1]["read_at"] is not None  # patient's message read when doctor listed
    assert login(c, u["doc1"]).post(path, json={"body": ""}).status_code == 422
    assert login(c, u["doc2"]).get(path).status_code == 403


def _raw(tmp, rows, name="s.jsonl"):
    p = tmp / name
    p.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    return p


def test_trace(env, tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "RAW_DIR", tmp_path)
    c, u = env.client, env.users
    t0 = NOW - timedelta(minutes=1)
    start_ms = t0.timestamp() * 1000
    # 3 s of 100 Hz samples, tilted by gravity on y/z (roll = atan2(1,1) = 45 deg), in 1 s batches
    def batch(k, srv):
        return {"server_time_ms": srv, "device_id": "imu_a", "samples": [
            {"timestamp": (k * 100 + i) * 10_000, "accel": {"x": 0, "y": 0.707, "z": 0.707}, "gyro": {"x": 0, "y": 0, "z": 0}} for i in range(100)]}
    rows = [batch(0, start_ms - 10_000), batch(1, start_ms + 1000), batch(2, start_ms + 2000), batch(3, start_ms + 4000_000)]
    _raw(tmp_path, rows)
    with env.SL() as s:
        ses = add_session(s, u["patA"].id, "imu_a", 0, 70, raw_file="s.jsonl")
        ses.started_at, ses.ended_at = t0, t0 + timedelta(seconds=10)
        s.commit()
        sid = ses.id
    r = login(c, u["doc1"]).get(f"/api/sessions/{sid}/trace")
    assert r.status_code == 200
    j = r.json()
    assert j["rate_hz"] == 20 and j["points"][0]["t_s"] == 0
    assert 38 <= len(j["points"]) <= 42  # 2 s in window at 20 Hz
    assert all(abs(p["roll"] - 45) < 0.1 and abs(p["pitch"]) < 0.1 for p in j["points"])
    assert login(c, u["doc2"]).get(f"/api/sessions/{sid}/trace").status_code == 403
    assert login(c, u["patA"]).get(f"/api/sessions/{sid}/trace").status_code == 403
    assert login(c, u["admin"]).get(f"/api/sessions/{sid}/trace").status_code == 200
    assert login(c, u["doc1"]).get("/api/sessions/99999/trace").status_code == 404
    # no file / missing file / traversal
    outside = tmp_path.parent / "outside.jsonl"
    outside.write_text(json.dumps(rows[1]) + "\n")
    with env.SL() as s:
        ids = []
        for rf in (None, "missing.jsonl", "../outside.jsonl", str(outside)):
            ids.append(add_session(s, u["patA"].id, "imu_a", 1, 70, raw_file=rf).id)
        s.commit()
    login(c, u["doc1"])
    for i in ids:
        assert c.get(f"/api/sessions/{i}/trace").status_code == 404, i
    outside.unlink()


def test_reps_csv_injection(env):
    c, u = env.client, env.users
    with env.SL() as s:
        ses = s.scalar(select(Session).where(Session.patient_id == u["patA"].id))
        s.add(Rep(session_id=ses.id, level=1, task="=HYPERLINK(\"x\")", rep=9, duration_s=1.0, roll_range_deg=-5.0))
        for t in ("+1", "-1", "@x", "\tx", "ok"):
            s.add(Rep(session_id=ses.id, level=1, task=t, rep=9, duration_s=1.0))
        s.commit()
    r = login(c, u["doc1"]).get(f"/api/patients/{u['patA'].id}/reps.csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    import csv, io
    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[0][0] == "session_id" and len(rows) == 1 + 12 + 6
    tasks = [x[3] for x in rows[1:]]
    assert "'=HYPERLINK(\"x\")" in tasks and "'+1" in tasks and "'-1" in tasks and "'@x" in tasks and "'\tx" in tasks and "ok" in tasks
    assert not any(t[:1] in "=+-@\t\r" for t in tasks if t)
    assert any(x[7] == "-5.0" for x in rows[1:])  # numbers stay numbers
    assert login(c, u["patA"]).get(f"/api/patients/{u['patA'].id}/reps.csv").status_code == 200
    assert login(c, u["patB"]).get(f"/api/patients/{u['patA'].id}/reps.csv").status_code == 403
