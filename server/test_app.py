"""Run: python test_app.py"""
import json
import math
import os
import socket
import tempfile

os.environ["IMU_RAW_DIR"] = tempfile.mkdtemp()
os.environ["IMU_PROCESSED_DIR"] = tempfile.mkdtemp()
game = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)  # stands in for the Godot game
game.bind(("127.0.0.1", 0))
game.settimeout(2)
os.environ["GAME_PORT"] = str(game.getsockname()[1])

from fastapi.testclient import TestClient  # noqa: E402

import app  # noqa: E402
from app import ClockMap  # noqa: E402
from features import WristReps  # noqa: E402
from orientation import Tilt, accel_to_angles  # noqa: E402
from quality import level_quality, next_level, score  # noqa: E402

# Entered once: all requests share one event loop, like uvicorn. Without it each WebSocket gets its own
# loop and the cross-connection broadcast to /ws/live never arrives.
client = TestClient(app.app).__enter__()


def batch(seq, t0, n=10, ax=0.0):
    return {
        "device_id": "imu_test",
        "seq": seq,
        "samples": [
            {"timestamp": t0 + i * 10_000, "accel": {"x": ax, "y": 0.0, "z": 1.0}, "gyro": {"x": 0.1, "y": 0.0, "z": -0.1}}
            for i in range(n)
        ],
    }


def test_tilt():
    assert accel_to_angles(0, 0, 1) == (0.0, 0.0)
    p, r = accel_to_angles(-math.sin(math.radians(30)), 0, math.cos(math.radians(30)))
    assert abs(p - 30) < 1e-9 and abs(r) < 1e-9
    t = Tilt()
    # Still sensor tilted 30 deg pitch, gyro biased +1 dps: filter must stay near 30, not drift away.
    for i in range(1000):  # 10 s at 100 Hz
        p, r = t.update(i * 10_000, -0.5, 0.0, math.sqrt(3) / 2, 0.0, 1.0)
    assert abs(p - 30) < 1.0 and abs(r) < 1e-6, (p, r)
    # Pure gyro over one short step follows the rate (gyro dominates short term).
    p0 = t.pitch
    p, _ = t.update(1000 * 10_000, -0.5, 0.0, math.sqrt(3) / 2, 0.0, 100.0)
    assert 0.9 < p - p0 < 1.0, p - p0


def cycles(r, n, period_s, rest_s=0.0, amp=15.0, t=0):
    """Feed n smooth out-and-back cycles (peak 2*amp deg) at 100 Hz, optional rest between. Returns (reps, t)."""
    found, per = [], int(period_s * 100)
    for _ in range(n):
        for i in range(per + int(rest_s * 100)):
            if i < per:
                ang = amp * (1 - math.cos(2 * math.pi * i / per))
                rate = amp * (2 * math.pi / period_s) * math.sin(2 * math.pi * i / per)
            else:
                ang = rate = 0.0
            rep = r.update(t, ang, rate)
            t += 10_000
            if rep:
                found.append(rep)
    return found, t


def test_clock():
    c = ClockMap()
    for i in range(10):  # 10-sample batches every 100 ms (last sample at device ms i*100+90), 20 ms network delay
        c.add(1_000_000 + i * 100 + 90 + 20, (i * 100 + 90) * 1000)
    assert c.wall(0) == 1_000_020  # device time 0 -> server wall clock
    # Wi-Fi stall: batch with device ms 1000..1090 arrives 3 s late (burst). Its samples must still map to capture time.
    c.add(1_000_000 + 1090 + 20 + 3000, (1000 + 90) * 1000)
    assert c.wall(1_000_000) == 1_000_020 + 1000, c.wall(1_000_000)
    print("clock ok")


def test_quality():
    base = {"task": "T", "duration_s": 10.0, "speed_peaks": 4}
    assert score(base, []) is None and score(base, [{**base, "task": "other"}]) is None
    assert score(base, [base])["quality"] == 100
    slow = score({**base, "duration_s": 20.0}, [base])  # half as fast: timing 50, smoothness 100
    assert slow == {"quality": 75, "timing_score": 50, "smoothness_score": 100}, slow
    assert score({**base, "duration_s": 5.0, "speed_peaks": 1}, [base])["quality"] == 100  # better than usual is capped
    jerky = score({**base, "speed_peaks": 8}, [base])  # twice the peaks: smoothness 50
    assert jerky["smoothness_score"] == 50 and jerky["quality"] == 75, jerky
    # Level quality = mean of the scored reps of the level (the first rep of a task is unscored).
    assert level_quality([{"quality": None}]) is None and level_quality([{"quality": None}, {"quality": 80}, {"quality": 100}]) == 90
    # Next level: good -> up (9 wraps to 1), poor -> down (floor 1), in between -> repeat, no score -> plain progression.
    assert next_level(3, 95) == 4 and next_level(3, 90) == 4 and next_level(9, 100) == 1
    assert next_level(3, 59) == 2 and next_level(1, 10) == 1
    assert next_level(3, 75) == 3 and next_level(3, 60) == 3
    assert next_level(3, None) == 4
    print("quality ok")


def test_reps():
    """Synthetic smooth reps: exact count and sane features."""
    r = WristReps()
    still, t = [r.update(i * 10_000, 0.0, 0.0) for i in range(100)], 100 * 10_000  # 1 s still: sets neutral
    found, t = cycles(r, 3, 3.0, rest_s=1.0, amp=20.0, t=t)
    assert len(found) == 3 and r.attempts == 3, found
    f = found[0]
    assert abs(f["range_deg"] - 40) < 2 and f["direction"] == "positive" and 1.5 < f["duration_s"] < 2.5, f
    assert f["speed_peaks"] == 2 and 35 < f["peak_speed_dps"] < 45, f  # one bell out, one back

    # No pause between reps (continuous play): neutral stays fixed, reps still split.
    r = WristReps()
    for i in range(100):
        r.update(i * 10_000, 0.0, 0.0)
    found, _ = cycles(r, 4, 1.5, t=100 * 10_000)
    assert len(found) >= 3, found

    # Wobble below ENTER_DEG is not a rep.
    r = WristReps()
    for i in range(200):
        assert r.update(i * 10_000, 4 * math.sin(i / 10), 5.0) is None

    # A gap drops the rep in progress (nothing reported), keeps neutral; the sample after it starts a fresh rep.
    t = 200 * 10_000
    r.update(t, 20, 50)
    assert r.moving
    r.update(t + 5_000_000, 20, 50)
    assert r.attempts == 0 and r.neutral is not None and r.t0 == t + 5_000_000  # old rep dropped, fresh one began

    # Wrap-safe: neutral +175, angle -170 is 15 deg away (not 345), so it starts a rep; -175 is only 10.
    r = WristReps()
    r.zero(175.0)
    r.update(0, -175.0, 0.0)
    assert not r.moving
    r.update(10_000, -170.0, 0.0)
    assert r.moving
    print("reps ok")



def test():
    assert client.post("/api/imu", json=batch(0, 0)).status_code == 200
    pkt = json.loads(game.recv(1024))
    assert set(pkt) == {"pitch", "roll", "trunk_lean"} and abs(pkt["pitch"]) < 0.05 and abs(pkt["roll"]) < 0.05, pkt
    assert client.post("/api/imu", json=batch(3, 100_000)).status_code == 200  # seq 1,2 lost
    assert client.post("/api/imu", json=batch(4, 200_000, ax=20.0)).status_code == 422  # > ±16 g
    bad = batch(4, 200_000)
    bad["samples"][5]["timestamp"] = 0
    assert client.post("/api/imu", json=bad).status_code == 422  # non-monotonic

    with client.websocket_connect("/ws/live") as live, client.websocket_connect("/ws/imu") as imu:
        imu.send_json(batch(4, 200_000))
        msg = live.receive_json()
        assert msg["device_id"] == "imu_test" and len(msg["samples"]) == 10
        assert msg["stats"]["connected"] is True
        imu.send_text("not json")
        assert "error" in imu.receive_json()

    # Game reports a finished rep: server pairs it with sensor features from the last duration_s.
    now_ms = int(__import__("time").time() * 1000)
    wins = {"device_id": "imu_test", "seq": 5, "samples": [
        {"timestamp": 300_000 + i * 10_000, "accel": {"x": 0.0, "y": 0.0, "z": 1.0}, "gyro": {"x": 100.0, "y": 0.0, "z": 0.0}}
        for i in range(10)]}
    assert client.post("/api/imu", json=wins).status_code == 200
    ev = {"device_id": "imu_test", "level": 1, "task": "Dial soil", "rep": 1, "duration_s": 5.0}
    r = client.post("/api/game_event", json=ev)
    assert r.status_code == 200, r.text
    g = r.json()
    assert g["game_rep"] == 1 and g["task"] == "Dial soil" and g["samples"] >= 10 and 99 < g["peak_speed_dps"] < 101, g
    assert g["quality"] is None and g["level_quality"] is None and g["next_level"] is None, g  # first rep: nothing to compare with
    g2 = client.post("/api/game_event", json={**ev, "rep": 2}).json()
    assert g2["quality"] == 100 and g2["game_rep"] == 2 and g2["next_level"] is None, g2  # same duration/peaks as the reference
    g3 = client.post("/api/game_event", json={**ev, "rep": 3}).json()  # last rep of the level: decide where to go
    assert g3["level_quality"] == 100 and g3["next_level"] == 2, g3  # good -> level 2
    assert g3["scored_reps"] == 2 and g3["q_up"] == 90 and g3["q_down"] == 60 and g3["adapt"] is True, g3  # for the player-facing explanation
    assert client.post("/api/adapt/off").json()["adapt"] is False
    g4 = client.post("/api/game_event", json={**ev, "rep": 3, "reps_required": 3}).json()
    assert g4["next_level"] == 2, g4  # adaptation off: fixed progression
    client.post("/api/adapt/on")
    slowrep = {**ev, "rep": 1, "duration_s": 60.0}  # new play of the level; rep 1 is unscored
    assert client.post("/api/game_event", json=slowrep).json()["quality"] is not None  # task history exists from the earlier plays
    poor = client.post("/api/game_event", json={**ev, "rep": 3, "duration_s": 500.0}).json()  # very slow last rep
    assert poor["next_level"] in (1, 2), poor  # not unconditionally "up"; level 1 can't go below 1
    sess = client.get("/api/session").json()["imu_test"]
    assert sess["game_reps"] == 6 and sess["tasks"]["Dial soil"]["reps"] == 6 and sess["level"] == 1, sess
    assert client.post("/api/adapt/off").json()["adapt"] is False
    assert client.post("/api/adapt/maybe").status_code == 422
    client.post("/api/adapt/on")
    assert client.post("/api/game_event", json={**ev, "device_id": "nope"}).status_code == 404
    assert client.post("/api/game_event", json={**ev, "duration_s": -1}).status_code == 422

    s = client.get("/api/status").json()
    d = s["devices"]["imu_test"]
    assert d["game_rep_count"] == 6 and d["level"] == 1, d
    assert d["packets"] == 4 and d["samples"] == 40 and d["dropped_packets"] == 2
    assert d["sample_rate_hz"] == 100.0, d["sample_rate_hz"]
    assert d["connected"] is False
    assert s["invalid_packets"] == 3
    with open(d["raw_log"]) as f:
        assert len(f.readlines()) == 4
    print("ok")


if __name__ == "__main__":
    test_tilt()
    test_reps()
    test_quality()
    test_clock()
    test()
