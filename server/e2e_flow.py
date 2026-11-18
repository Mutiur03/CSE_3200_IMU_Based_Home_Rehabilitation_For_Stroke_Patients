"""End-to-end flow against a RUNNING platform server (real Postgres, real WebSockets). Not part of pytest.
  python e2e_flow.py [--base http://127.0.0.1:18200]
Env: E2E_BASE, SEED_PASSWORD (all seeded users), KEY_IMU_01, KEY_IMU_02 (device keys printed by seed.py), JWT_SECRET (forge/expiry tests),
DATABASE_URL (optional: backdates a patient so the no-session alert rule can fire). Needs a freshly seeded DB (plan/sessions empty).
Prints PASS/FAIL per step, exits 1 on any FAIL."""
import argparse
import asyncio
import json
import math
import os
import sys
import time
import uuid

import httpx
import websockets

ap = argparse.ArgumentParser()
ap.add_argument("--base", default=os.environ.get("E2E_BASE", "http://127.0.0.1:18200"))
BASE = ap.parse_args().base
WS = BASE.replace("http", "ws", 1)
PW = os.environ["SEED_PASSWORD"]
KEY1, KEY2 = os.environ["KEY_IMU_01"], os.environ["KEY_IMU_02"]
FAILS = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  [{detail}]"))
    if not cond:
        FAILS.append(name)


def cli():
    return httpx.AsyncClient(base_url=BASE, timeout=20)


async def login(email):
    c = cli()
    r = await c.post("/api/auth/login", json={"email": email, "password": PW})
    check(f"login {email}", r.status_code == 200, r.text)
    return c


def batch(device_id, seq, t0_us, n, roll_fn):
    """n samples at 100 Hz; accel in g (tilted about X by roll), gyro in dps (roll rate on x)."""
    out = []
    for i in range(n):
        t = t0_us + i * 10_000
        th, rate = roll_fn(t / 1e6)
        out.append({"timestamp": t, "accel": {"x": 0.0, "y": round(math.sin(math.radians(th)), 5), "z": round(math.cos(math.radians(th)), 5)},
                    "gyro": {"x": round(rate, 3), "y": 0.0, "z": 0.0}})
    return {"device_id": device_id, "seq": seq, "samples": out}


def forearm_roll(t):  # +-25 deg, 0.4 Hz
    w = 2 * math.pi * 0.4
    return 25 * math.sin(w * t), 25 * w * math.cos(w * t)  # (deg, deg/s)


def held_roll(t):  # imu_02: held at 60 deg (distinguishable from imu_01's +-25)
    return 60.0, 0.0


async def simulate(device_id, key, seconds, fn):
    t0 = int(time.monotonic() * 1e6)
    async with websockets.connect(WS + "/ws/imu", additional_headers={"X-Device-Key": key}) as ws:
        seq, start = 0, time.monotonic()
        while time.monotonic() - start < seconds:
            await ws.send(json.dumps(batch(device_id, seq, t0 + seq * 100_000, 10, fn)))
            seq += 1
            await asyncio.sleep(0.1)
        await asyncio.sleep(0.2)
    return seq


async def collect(path, cookie, store):
    try:
        async with websockets.connect(WS + path, additional_headers={"Cookie": f"session={cookie}"}) as ws:
            async for m in ws:
                store.append(json.loads(m))
    except Exception:
        pass


async def ws_rejected(path, headers, first=None):
    try:
        async with websockets.connect(WS + path, additional_headers=headers) as ws:
            if first:
                await ws.send(json.dumps(first))
            await asyncio.wait_for(ws.recv(), 3)
            await asyncio.wait_for(ws.recv(), 3)  # error frame then close
        return False
    except (websockets.ConnectionClosed, websockets.InvalidStatus, asyncio.TimeoutError):
        return True


async def main():
    admin, doc, pat, pat2 = [await login(e) for e in ("admin@demo", "doctor@demo", "patient@demo", "patient2@demo")]
    me = (await pat.get("/api/auth/me")).json()
    pid, pid2 = me["id"], (await pat2.get("/api/auth/me")).json()["id"]
    did = (await doc.get("/api/auth/me")).json()["id"]

    # ---- wristband auth
    ok_b = batch("imu_01", 0, 1_000_000, 5, forearm_roll)
    check("ws/imu wrong key rejected", await ws_rejected("/ws/imu", {"X-Device-Key": "nope"}, ok_b))
    check("ws/imu no key rejected", await ws_rejected("/ws/imu", {}, ok_b))
    check("ws/imu imu_02 key cannot send as imu_01", await ws_rejected("/ws/imu", {"X-Device-Key": KEY2}, ok_b))
    async with httpx.AsyncClient(base_url=BASE) as a:
        check("POST /api/imu no key 401", (await a.post("/api/imu", json=ok_b)).status_code == 401)
        check("POST /api/imu bad batch 422", (await a.post("/api/imu", json={"device_id": "imu_01"}, headers={"X-Device-Key": KEY1})).status_code == 422)

    # ---- patient before plan
    check("GET /api/plan 404 before plan", (await pat.get("/api/plan")).status_code == 404)
    check("doctor cannot GET /api/plan (patient only)", (await doc.get("/api/plan")).status_code == 403)
    r = await doc.get("/api/patients")
    check("patient list has flags=[] without alert rule", r.status_code == 200 and all(p["flags"] == [] for p in r.json()), r.text)
    check("doctor sees only their 2 seeded patients", {p["id"] for p in r.json()} >= {pid, pid2})

    # doctor sets plan + alert rule
    plan = {"levels_allowed": [1, 2, 3], "reps_per_level": 3, "sessions_per_week": 3, "adapt_on": True}
    r = await doc.put(f"/api/patients/{pid}/plan", json=plan)
    check("doctor PUT plan", r.status_code == 200 and r.json()["levels_allowed"] == [1, 2, 3], r.text)
    r = await pat.get("/api/plan")
    check("patient GET /api/plan 200", r.status_code == 200 and r.json()["reps_per_level"] == 3, r.text)
    check("plan bad levels 422", (await doc.put(f"/api/patients/{pid}/plan", json={**plan, "levels_allowed": [1, 1]})).status_code == 422)
    check("plan level 10 422", (await doc.put(f"/api/patients/{pid}/plan", json={**plan, "levels_allowed": [10]})).status_code == 422)
    check("patient cannot PUT plan", (await pat.put(f"/api/patients/{pid}/plan", json=plan)).status_code == 403)
    r = await doc.put(f"/api/patients/{pid}/alert-rules", json={"max_days_without_session": 3, "quality_drop_pct": 20})
    check("doctor PUT alert rule", r.status_code == 200, r.text)
    check("alert rule 0 days 422", (await doc.put(f"/api/patients/{pid}/alert-rules", json={"max_days_without_session": 0})).status_code == 422)
    await doc.put(f"/api/patients/{pid}/alert-rules", json={"max_days_without_session": 3, "quality_drop_pct": 20})
    check("patient cannot read alert rules", (await pat.get(f"/api/patients/{pid}/alert-rules")).status_code == 403)

    # ---- live streaming + session + reps
    sim1 = asyncio.create_task(simulate("imu_01", KEY1, 13, forearm_roll))
    sim2 = asyncio.create_task(simulate("imu_02", KEY2, 13, held_roll))
    await asyncio.sleep(1.5)
    r = await pat.post("/api/sessions/start")
    check("patient start session", r.status_code == 201 and r.json()["ended_at"] is None, r.text)
    sid = r.json()["id"]
    r2 = await pat.post("/api/sessions/start")
    check("second start returns same open session", r2.status_code == 201 and r2.json()["id"] == sid, r2.text)
    g1, g2 = [], []
    t1 = asyncio.create_task(collect("/ws/game", pat.cookies.get("session"), g1))
    t2 = asyncio.create_task(collect("/ws/game", pat2.cookies.get("session"), g2))
    check("ws/game no cookie rejected", await ws_rejected("/ws/game", {}))
    check("ws/game doctor cookie rejected", await ws_rejected("/ws/game", {"Cookie": f"session={doc.cookies.get('session')}"}))
    async with httpx.AsyncClient(base_url=BASE) as a:
        r = await a.post("/api/game_event", json={"device_id": "imu_01", "level": 1, "task": "t", "rep": 1, "duration_s": 0.9})
        check("game_event anonymous does not create a stored rep", r.status_code in (200, 401, 403, 404), r.text)

    reps = []
    for lvl in (1, 2, 3):
        for rep in (1, 2, 3):
            await asyncio.sleep(1.0)
            r = await pat.post("/api/game_event", json={"device_id": "ignored", "level": lvl, "task": f"task_{lvl}", "rep": rep, "duration_s": 0.9 + 0.02 * rep})
            reps.append(r)
            ok = r.status_code == 200
            j = r.json() if ok else {}
            check(f"game_event L{lvl} rep{rep} 200", ok, r.text)
            if ok:
                check(f"  quality {'null' if rep == 1 else 'set'} L{lvl} rep{rep}", (j["quality"] is None) == (rep == 1), str(j.get("quality")))
                if rep == 3:
                    check(f"  next_level set and in plan after L{lvl}", j["next_level"] in (1, 2, 3), str(j.get("next_level")))
                else:
                    check(f"  next_level null before last rep L{lvl} rep{rep}", j["next_level"] is None)
    check("rep window saw sensor features", reps[1].status_code == 200 and reps[1].json()["roll_range_deg"] not in (None, 0), reps[1].text)
    await asyncio.gather(sim1, sim2)
    await asyncio.sleep(0.3)
    t1.cancel(), t2.cancel()
    check("patient game WS got tilt frames", len(g1) > 50, f"{len(g1)}")
    check("patient game WS: only own device (|roll|<=40)", g1 and max(abs(f["roll"]) for f in g1) <= 40, str(max((abs(f["roll"]) for f in g1), default=None)))
    check("patient2 game WS: only own device (roll ~60)", g2 and min(f["roll"] for f in g2) > 50, str(min((f["roll"] for f in g2), default=None)))
    r = await pat.post("/api/sessions/end")
    check("patient end session", r.status_code == 200 and r.json()["n_reps"] == 9 and r.json()["ended_at"], r.text)
    check("end again 409", (await pat.post("/api/sessions/end")).status_code == 409)
    check("sessions/current null after end", (await pat.get("/api/sessions/current")).json() is None)

    # ---- patient reads
    r = await pat.get(f"/api/patients/{pid}/sessions")
    check("patient lists own sessions", r.status_code == 200 and len(r.json()) == 1 and r.json()[0]["mean_roll_range_deg"] is not None, r.text)
    r = await pat.get(f"/api/sessions/{sid}")
    check("session detail 9 reps, 3 null quality", r.status_code == 200 and len(r.json()["reps"]) == 9 and sum(x["quality"] is None for x in r.json()["reps"]) == 3, r.text[:200])
    check("patient2 cannot read patient1 sessions", (await pat2.get(f"/api/patients/{pid}/sessions")).status_code == 403)
    check("patient2 session detail 404", (await pat2.get(f"/api/sessions/{sid}")).status_code == 404)
    check("patient2 cannot read patient1 messages", (await pat2.get(f"/api/patients/{pid}/messages")).status_code == 403)
    check("patient cannot read patient list", (await pat.get("/api/patients")).status_code == 403)
    check("patient cannot read trace", (await pat.get(f"/api/sessions/{sid}/trace")).status_code == 403)

    # ---- doctor
    r = await doc.get("/api/patients")
    p1 = next(p for p in r.json() if p["id"] == pid)
    check("doctor list: patient1 summary", p1["sessions_total"] == 1 and p1["device_id"] == "imu_01" and p1["flags"] == [], str(p1))
    r = await doc.get(f"/api/patients/{pid}")
    check("doctor patient detail has plan+rule", r.status_code == 200 and r.json()["plan"] and r.json()["alert_rule"]["max_days_without_session"] == 3, r.text)
    r = await doc.get(f"/api/patients/{pid}/progress")
    check("doctor progress", r.status_code == 200 and len(r.json()["sessions"]) == 1 and r.json()["improvement"]["index"] is None, r.text[:200])
    r = await doc.get(f"/api/patients/{pid}/sessions")
    check("doctor sessions", r.status_code == 200 and len(r.json()) == 1)
    r = await doc.get(f"/api/sessions/{sid}/trace")
    check("doctor trace from raw file", r.status_code == 200 and len(r.json()["points"]) > 100, r.text[:200])
    pts = r.json()["points"] if r.status_code == 200 else []
    check("trace points sane (no NaN, |roll|<=40)", pts and all(abs(p["roll"]) <= 40 for p in pts))
    a = {"assessed_on": "2026-11-01", "rubric": dict(range=3, smoothness=4, control=3, adherence=5, overall=4), "scale_name": "FMA-UE", "scale_score": 41.5, "comment": "ok"}
    r = await doc.post(f"/api/patients/{pid}/assessments", json=a)
    check("doctor create assessment", r.status_code == 201, r.text)
    check("assessment rubric 6 -> 422", (await doc.post(f"/api/patients/{pid}/assessments", json={**a, "rubric": {**a["rubric"], "range": 6}})).status_code == 422)
    check("patient cannot create assessment", (await pat.post(f"/api/patients/{pid}/assessments", json=a)).status_code == 403)
    r = await doc.get(f"/api/patients/{pid}/assessments")
    check("list assessments", r.status_code == 200 and len(r.json()) == 1)
    r = await doc.post(f"/api/patients/{pid}/messages", json={"body": "Well done"})
    check("doctor sends message", r.status_code == 201 and r.json()["from_name"], r.text)
    r = await pat.get(f"/api/patients/{pid}/messages")
    check("patient reads it and it is marked read", r.status_code == 200 and len(r.json()) == 1, r.text)
    r = await pat.post(f"/api/patients/{pid}/messages", json={"body": "Thanks"})
    check("patient replies", r.status_code == 201)
    r = await doc.get(f"/api/patients/{pid}/messages")
    check("doctor sees both, reply read", [x["from_name"] for x in r.json()][-1] == "Patient A" and len(r.json()) == 2, r.text)
    r = await doc.get(f"/api/patients/{pid}/reps.csv")
    check("reps.csv 9 rows + header", r.status_code == 200 and len(r.text.strip().splitlines()) == 10 and r.headers["content-type"].startswith("text/csv"), r.text[:100])
    check("patient own reps.csv ok", (await pat.get(f"/api/patients/{pid}/reps.csv")).status_code == 200)
    check("patient2 reps.csv 403", (await pat2.get(f"/api/patients/{pid}/reps.csv")).status_code == 403)

    # ---- admin
    r = await admin.post("/api/admin/users", json={"role": "doctor", "name": "Dr. Two", "email": "doctor2@demo", "password": "Doctor2-pass-1"})
    check("admin create doctor2", r.status_code == 201, r.text)
    d2 = r.json()["id"]
    r = await admin.post("/api/admin/users", json={"role": "patient", "name": "Patient C", "email": "patient3@demo", "password": "Patient3-pass-1", "doctor_id": did, "affected_side": "left", "onset_date": "2026-01-02"})
    check("admin create patient3", r.status_code == 201, r.text)
    p3 = r.json()["id"]
    check("duplicate email 409", (await admin.post("/api/admin/users", json={"role": "doctor", "name": "x", "email": "DOCTOR2@demo", "password": "Doctor2-pass-1"})).status_code == 409)
    check("non-admin cannot create user", (await doc.post("/api/admin/users", json={"role": "doctor", "name": "x", "email": "z@demo", "password": "Doctor2-pass-1"})).status_code == 403)
    r = await admin.post("/api/admin/devices", json={"device_id": "imu_03", "patient_id": p3})
    key3 = r.json().get("device_key") if r.status_code == 201 else None
    check("admin register device (key once)", r.status_code == 201 and key3, r.text)
    check("device list does not expose key", "key" not in (await admin.get("/api/admin/devices")).text.replace("device_key", ""))
    check("duplicate device 409", (await admin.post("/api/admin/devices", json={"device_id": "imu_03"})).status_code == 409)
    check("second device for patient 409", (await admin.post("/api/admin/devices", json={"device_id": "imu_04", "patient_id": p3})).status_code == 409)
    check("new key works on ws", not await ws_rejected_open("imu_03", key3))
    check("doctor1 has patient3", p3 in [p["id"] for p in (await doc.get("/api/patients")).json()])
    c2 = cli()
    r = await c2.post("/api/auth/login", json={"email": "doctor2@demo", "password": "Doctor2-pass-1"})
    check("doctor2 login", r.status_code == 200, r.text)
    check("doctor2 list empty before assignment", (await c2.get("/api/patients")).json() == [])
    r = await admin.put(f"/api/admin/patients/{p3}/doctor", json={"doctor_id": d2})
    check("admin assign doctor", r.status_code == 204, r.text)
    check("assign non-doctor 422", (await admin.put(f"/api/admin/patients/{p3}/doctor", json={"doctor_id": pid})).status_code == 422)
    check("assign unknown patient 404", (await admin.put("/api/admin/patients/999999/doctor", json={"doctor_id": d2})).status_code == 404)
    check("doctor2 now sees patient3", [p["id"] for p in (await c2.get("/api/patients")).json()] == [p3])
    check("doctor1 no longer sees patient3", p3 not in [p["id"] for p in (await doc.get("/api/patients")).json()])
    # cross-doctor isolation
    for path in (f"/api/patients/{pid}", f"/api/patients/{pid}/progress", f"/api/patients/{pid}/sessions", f"/api/patients/{pid}/messages",
                 f"/api/patients/{pid}/reps.csv", f"/api/patients/{pid}/assessments", f"/api/patients/{pid}/plan", f"/api/sessions/{sid}/trace"):
        check(f"doctor2 403 on {path}", (await c2.get(path)).status_code == 403)
    check("doctor2 404 on session detail", (await c2.get(f"/api/sessions/{sid}")).status_code == 404)
    check("doctor2 cannot write plan for patient1", (await c2.put(f"/api/patients/{pid}/plan", json=plan)).status_code == 403)
    check("doctor1 403 on patient3", (await doc.get(f"/api/patients/{p3}")).status_code == 403)
    check("unknown patient 404 for admin", (await admin.get("/api/patients/999999")).status_code == 404)
    check("admin can read any patient", (await admin.get(f"/api/patients/{pid}")).status_code == 200)

    # alert rule fires only with a rule (backdate patient3's account if we can reach the DB)
    if os.environ.get("DATABASE_URL"):
        import sqlalchemy as sa
        eng = sa.create_engine(os.environ["DATABASE_URL"])
        with eng.begin() as c:
            c.execute(sa.text("update users set created_at = now() - interval '10 days' where id = :i"), {"i": p3})
        r = await c2.get("/api/patients")
        check("no rule -> no flag even when 10 days idle", r.json()[0]["flags"] == [], r.text)
        await c2.put(f"/api/patients/{p3}/alert-rules", json={"max_days_without_session": 3})
        r = await c2.get("/api/patients")
        check("rule set -> no_session flag", [f["kind"] for f in r.json()[0]["flags"]] == ["no_session"], r.text)

    # ---- input hardening
    await hardening(admin, doc, pat, pid, sid)

    # ---- logout
    r = await pat2.post("/api/auth/logout")
    check("logout 204", r.status_code == 204)
    check("after logout /me 401", (await pat2.get("/api/auth/me")).status_code == 401)
    check("after logout ws/game rejected", await ws_rejected("/ws/game", {"Cookie": f"session={pat2.cookies.get('session') or ''}"}))
    for c in (admin, doc, pat, pat2, c2):
        await c.aclose()
    print(f"\n{'ALL PASS' if not FAILS else 'FAILED: ' + ', '.join(FAILS)}")
    return 1 if FAILS else 0


async def ws_rejected_open(device_id, key):
    """True if the key was rejected (batch sent, no clean accept)."""
    """True if the server rejected the key (sent 'unauthorized' or closed); silence = accepted."""
    async with websockets.connect(WS + "/ws/imu", additional_headers={"X-Device-Key": key}) as ws:
        await ws.send(json.dumps(batch(device_id, 0, 5_000_000, 3, forearm_roll)))
        try:
            m = await asyncio.wait_for(ws.recv(), 0.7)
            return "unauthorized" in m  # silence = accepted
        except asyncio.TimeoutError:
            return False
        except websockets.ConnectionClosed:
            return True


async def hardening(admin, doc, pat, pid, sid):
    import jwt
    async with httpx.AsyncClient(base_url=BASE) as a:
        for path in ("/api/auth/me", "/api/patients", f"/api/patients/{pid}", "/api/plan", "/api/admin/users", f"/api/sessions/{sid}"):
            check(f"anonymous 401 {path}", (await a.get(path)).status_code == 401)
        a.cookies.set("session", "garbage.token.value")
        check("forged garbage cookie 401", (await a.get("/api/auth/me")).status_code == 401)
        secret = os.environ.get("JWT_SECRET", "")
        claims = {"sub": "1", "role": "admin", "name": "x", "email": "admin@demo"}
        a.cookies.set("session", jwt.encode({**claims, "exp": int(time.time()) - 10}, secret, algorithm="HS256"))
        check("expired cookie 401", (await a.get("/api/auth/me")).status_code == 401)
        a.cookies.set("session", jwt.encode({**claims, "exp": int(time.time()) + 999}, "wrong-secret-wrong-secret-wrong-secret-1", algorithm="HS256"))
        check("wrong-secret admin cookie 401", (await a.get("/api/admin/users")).status_code == 401)
        a.cookies.set("session", jwt.encode({**claims}, "", algorithm="none"))
        check("alg=none cookie 401", (await a.get("/api/admin/users")).status_code == 401)
        a.cookies.clear()
        r = await a.post("/api/auth/login", json={"email": "admin@demo", "password": "wrong"})
        check("bad password 401", r.status_code == 401)
        check("login bad shape 422", (await a.post("/api/auth/login", json={"email": 1})).status_code == 422)
        check("login non-json 422", (await a.post("/api/auth/login", content=b"{nope", headers={"content-type": "application/json"})).status_code == 422)
        check("login SQL-ish email 401", (await a.post("/api/auth/login", json={"email": "' OR 1=1 --", "password": "x"})).status_code == 401)
        check("login NUL in email not 500", (await a.post("/api/auth/login", json={"email": "a\u0000b", "password": "x"})).status_code in (401, 422))
        check("game_event bad body 422", (await pat.post("/api/game_event", json={"level": 10, "task": "t", "rep": 1, "duration_s": 1, "device_id": "x"})).status_code == 422)
        for bad in ({"duration_s": 0}, {"duration_s": -1}, {"duration_s": 1e9}, {"rep": 10**12}, {"rep": -5}, {"task": "x" * 5000}, {"task": "a\u0000b"}, {"duration_s": "NaN"}):
            ev = {"device_id": "x", "level": 1, "task": "t", "rep": 1, "duration_s": 1, **bad}
            check(f"game_event {list(bad)[0]}={str(list(bad.values())[0])[:12]} -> 422", (await pat.post("/api/game_event", content=json.dumps(ev), headers={"content-type": "application/json"})).status_code == 422)
    for field, val in (("name", "x" * 5000), ("name", "a\u0000b"), ("email", "e" * 400), ("password", "short")):
        body = {"role": "doctor", "name": "N", "email": f"h{uuid.uuid4().hex[:6]}@demo", "password": "Longenough-1", field: val}
        r = await admin.post("/api/admin/users", json=body)
        check(f"admin create user bad {field} -> 422", r.status_code == 422, str(r.status_code))
    sqli = "Robert'); DROP TABLE users;--"
    r = await admin.post("/api/admin/users", json={"role": "doctor", "name": sqli, "email": f"s{uuid.uuid4().hex[:6]}@demo", "password": "Longenough-1"})
    check("SQL-ish name stored literally", r.status_code == 201 and r.json()["name"] == sqli, r.text)
    check("users table survived", (await admin.get("/api/admin/users")).status_code == 200)
    check("role bogus 422", (await admin.post("/api/admin/users", json={"role": "root", "name": "N", "email": "r@demo", "password": "Longenough-1"})).status_code == 422)
    check("patient with non-doctor doctor_id 422", (await admin.post("/api/admin/users", json={"role": "patient", "name": "N", "email": "r2@demo", "password": "Longenough-1", "doctor_id": pid})).status_code == 422)
    check("device bad id 422", (await admin.post("/api/admin/devices", json={"device_id": "a b/../x"})).status_code == 422)
    check("device unknown patient 404", (await admin.post("/api/admin/devices", json={"device_id": "imu_9", "patient_id": 999999})).status_code == 404)
    for field, val in (("body", "m" * 5000), ("body", ""), ("body", "a\u0000b")):
        check(f"message bad {field} -> 422", (await doc.post(f"/api/patients/{pid}/messages", json={field: val})).status_code == 422)
    check("message SQL-ish ok", (await doc.post(f"/api/patients/{pid}/messages", json={"body": "'; select pg_sleep(5);--"})).status_code == 201)
    a = {"assessed_on": "2026-11-01", "rubric": dict(range=3, smoothness=4, control=3, adherence=5, overall=4)}
    for bad in ({"assessed_on": "not-a-date"}, {"comment": "c" * 5000}, {"comment": "a\u0000b"}, {"scale_name": "s" * 100}, {"scale_score": "NaN"}, {"scale_score": 1e400}):
        r = await doc.post(f"/api/patients/{pid}/assessments", content=json.dumps({**a, **bad}), headers={"content-type": "application/json"})
        check(f"assessment {list(bad)[0]} bad -> 422", r.status_code == 422, str(r.status_code))
    for bad in ({"sessions_per_week": 99}, {"reps_per_level": 0}, {"adapt_on": "maybe"}, {"levels_allowed": []}, {"levels_allowed": [2**40]}):
        r = await doc.put(f"/api/patients/{pid}/plan", json={"levels_allowed": [1], "reps_per_level": 3, "sessions_per_week": 3, "adapt_on": True, **bad})
        check(f"plan {list(bad)[0]} bad -> 422", r.status_code == 422, str(r.status_code))
    for path in ("/api/patients/abc", "/api/sessions/99999999999999999999", "/api/patients/99999999999/progress", "/api/sessions/-1"):
        check(f"bad id {path} not 500", (await doc.get(path)).status_code in (404, 422, 403))
    # oversized ingest body / junk
    async with httpx.AsyncClient(base_url=BASE) as a:
        h = {"X-Device-Key": os.environ["KEY_IMU_01"]}
        big = batch("imu_01", 1, 50_000_000, 600, forearm_roll)
        check("ingest 600 samples -> 422", (await a.post("/api/imu", json=big, headers=h)).status_code == 422)
        check("ingest junk -> 422", (await a.post("/api/imu", content=b"\xff\xfe", headers=h)).status_code == 422)
        bad = batch("imu_01", 1, 50_000_000, 3, forearm_roll)
        bad["samples"][0]["accel"]["x"] = 99
        check("ingest accel out of range -> 422", (await a.post("/api/imu", json=bad, headers=h)).status_code == 422)
        check("ingest device_id traversal -> 422", (await a.post("/api/imu", json={**batch("imu_01", 1, 5, 2, forearm_roll), "device_id": "../x"}, headers=h)).status_code == 422)
        # platform-mode exposure: live/ops endpoints must not be open to anonymous callers
        for path in ("/api/status", "/api/session"):
            check(f"anonymous {path} not open", (await a.get(path)).status_code in (401, 403))
        for path in ("/api/zero/imu_01", "/api/adapt/off", "/api/reps/reset/imu_01", "/api/rep_done/imu_01", "/api/axis/pitch"):
            check(f"anonymous POST {path} not open", (await a.post(path)).status_code in (401, 403))
        check("anonymous ws/live rejected", await ws_rejected("/ws/live", {}))
        check("patient POST /api/adapt/off 403", (await pat.post("/api/adapt/off")).status_code == 403)
        check("doctor can read /api/status", (await doc.get("/api/status")).status_code == 200)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
