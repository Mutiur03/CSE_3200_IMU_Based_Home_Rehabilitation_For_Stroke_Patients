"""Throwaway populate for the final UI walk. Real API only, except the last step, which backdates sessions 1..7 in the SCRATCH DB
(the API cannot backdate; session 8 stays 'now' so its raw-file trace still resolves).
Env: BASE, SEED_PASSWORD, KEY_IMU_01, DATABASE_URL (psycopg URL, scratch only)."""
import asyncio, math, os, random
import httpx

BASE = os.environ.get("BASE", "http://127.0.0.1:18400")
PW, KEY = os.environ["SEED_PASSWORD"], os.environ["KEY_IMU_01"]
N, REP_S = 8, 2.5
random.seed(7)


async def stream(c, stop, amp, jit):
    t, seq = 1_000_000 * int(asyncio.get_event_loop().time()), 0
    w = 2 * math.pi * 0.4
    while not stop.is_set():
        out = []
        for _ in range(10):
            ts = t / 1e6
            th = amp * math.sin(w * ts) + random.gauss(0, jit)
            rate = amp * w * math.cos(w * ts)
            out.append({"timestamp": t, "accel": {"x": 0.0, "y": round(math.sin(math.radians(th)), 5), "z": round(math.cos(math.radians(th)), 5)},
                        "gyro": {"x": round(rate, 3), "y": 0.0, "z": 0.0}})
            t += 10_000
        seq += 1
        await c.post("/api/imu", json={"device_id": "imu_01", "seq": seq, "samples": out}, headers={"x-device-key": KEY})
        await asyncio.sleep(0.1)


async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as pat, httpx.AsyncClient(base_url=BASE, timeout=20) as doc, httpx.AsyncClient(base_url=BASE, timeout=20) as dev:
        for c, e in ((pat, "patient@demo"), (doc, "doctor@demo")):
            assert (await c.post("/api/auth/login", json={"email": e, "password": PW})).status_code == 200
        pid = (await pat.get("/api/auth/me")).json()["id"]
        r = await doc.put(f"/api/patients/{pid}/plan", json={"levels_allowed": [1, 2, 3], "reps_per_level": 3, "sessions_per_week": 3, "adapt_on": True}); assert r.status_code == 200, r.text
        for i in range(N):
            amp, jit = 11 + 2.4 * i + random.uniform(-1, 1), max(0.2, 2.2 - 0.25 * i)
            stop = asyncio.Event()
            task = asyncio.create_task(stream(dev, stop, amp, jit))
            await asyncio.sleep(2.5)
            assert (await pat.post("/api/sessions/start")).status_code == 201
            for lvl in (1, 2):
                for rep in (1, 2, 3):
                    await asyncio.sleep(REP_S + random.uniform(-0.3, 0.3) - 0.05 * i)
                    r = await pat.post("/api/game_event", json={"device_id": "x", "level": lvl, "task": f"Level {lvl} forearm rotation", "rep": rep, "reps_required": 3, "duration_s": REP_S})
                    assert r.status_code == 200, r.text
            r = await pat.post("/api/sessions/end"); assert r.status_code == 200, r.text
            print("session", i + 1, r.json()["mean_quality"])
            stop.set(); await task
        for d, sc in (((28), 31), (3, 38)):
            import datetime as dt
            b = {"assessed_on": str(dt.date.today() - dt.timedelta(days=d)), "scale_name": "FMA-UE", "scale_score": sc,
                 "rubric": {"range": 2 if d > 5 else 3, "smoothness": 2 if d > 5 else 3, "control": 3, "adherence": 4, "overall": 3 if d > 5 else 4},
                 "comment": "Forearm rotation range limited at start; steadier on the second half of each set." if d > 5 else "Clear gain in range and smoothness. Keep the current plan."}
            assert (await doc.post(f"/api/patients/{pid}/assessments", json=b)).status_code == 201
        assert (await doc.put(f"/api/patients/{pid}/alert-rules", json={"max_days_without_session": 4, "quality_drop_pct": 20})).status_code == 200
        for c, t in ((doc, "Good work this week. Aim for three sessions and keep the forearm slow and steady."),
                     (pat, "Thank you. My wrist felt tired after the second level, is that normal?"),
                     (doc, "Some fatigue is expected. Rest a minute between levels and tell me if it becomes pain.")):
            assert (await c.post(f"/api/patients/{pid}/messages", json={"body": t})).status_code == 201
    import psycopg
    url = os.environ["DATABASE_URL"].replace("+psycopg", "")
    with psycopg.connect(url) as cx:
        ids = [r[0] for r in cx.execute("select id from sessions order by id")]
        for k, sid in enumerate(ids[:-1]):
            days = 49 - 7 * k + (k % 2)
            cx.execute("update sessions set started_at=started_at - make_interval(days=>%s), ended_at=ended_at - make_interval(days=>%s) where id=%s", (days, days, sid))
            cx.execute("update reps set ts=ts - make_interval(days=>%s) where session_id=%s", (days, sid))
    print("done, patient", pid)

asyncio.run(main())
