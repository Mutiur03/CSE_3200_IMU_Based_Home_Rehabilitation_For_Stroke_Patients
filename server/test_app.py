"""Run: python test_app.py"""
import os
import tempfile

os.environ["IMU_RAW_DIR"] = tempfile.mkdtemp()

from fastapi.testclient import TestClient  # noqa: E402

import app  # noqa: E402

client = TestClient(app.app)


def batch(seq, t0, n=10, ax=0.0):
    return {
        "device_id": "imu_test",
        "seq": seq,
        "samples": [
            {"timestamp": t0 + i * 10_000, "accel": {"x": ax, "y": 0.0, "z": 1.0}, "gyro": {"x": 0.1, "y": 0.0, "z": -0.1}}
            for i in range(n)
        ],
    }


def test():
    assert client.post("/api/imu", json=batch(0, 0)).status_code == 200
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
    test()
