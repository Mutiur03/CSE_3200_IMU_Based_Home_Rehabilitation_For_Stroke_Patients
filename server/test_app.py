"""Run: python test_app.py"""
import json
import math
import os
import socket
import tempfile

os.environ["IMU_RAW_DIR"] = tempfile.mkdtemp()
game = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)  # stands in for the Godot game
game.bind(("127.0.0.1", 0))
game.settimeout(2)
os.environ["GAME_PORT"] = str(game.getsockname()[1])

from fastapi.testclient import TestClient  # noqa: E402

import app  # noqa: E402
from orientation import Tilt, accel_to_angles  # noqa: E402

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

    s = client.get("/api/status").json()
    d = s["devices"]["imu_test"]
    assert d["packets"] == 3 and d["samples"] == 30 and d["dropped_packets"] == 2
    assert d["sample_rate_hz"] == 100.0, d["sample_rate_hz"]
    assert d["connected"] is False
    assert s["invalid_packets"] == 3
    with open(d["raw_log"]) as f:
        assert len(f.readlines()) == 3
    print("ok")


if __name__ == "__main__":
    test_tilt()
    test()
