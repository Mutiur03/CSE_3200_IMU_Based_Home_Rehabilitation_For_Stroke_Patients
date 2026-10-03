# IMU Rehab Server

Phase 2–3 backend: receives ICM-42688-P data from the ESP32 over Wi-Fi, validates it, logs raw data, shows a live view.
No processing, assessment, or Unity output yet.

## Run

```bash
cd server
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Windows; use .venv/bin/pip on Linux/macOS
.venv/Scripts/python app.py    # or: uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

- Dashboard: `http://<pc-ip>:8000/`
- Test: `.venv/Scripts/python test_app.py`

`--host 0.0.0.0` so the ESP32 can reach it on the LAN. Allow port 8000 through the Windows firewall.

## Endpoints

| Endpoint | Who | Purpose |
|---|---|---|
| `WS /ws/imu` | ESP32 | Main stream. One text frame = one batch. Invalid batch → server replies `{"error": [...]}`, connection stays open. |
| `POST /api/imu` | ESP32 / testing | Same batch body. 200 or 422. |
| `GET /api/status` | anyone | Per-device packets, samples, dropped packets, resets, sample rate, connection state. |
| `WS /ws/live` | dashboard | Every valid batch + device stats. |
| `GET /` | browser | Live plot of accel/gyro + stats. |

## Packet schema (firmware ↔ server contract)

```json
{
  "device_id": "imu_01",
  "seq": 42,
  "samples": [
    {"timestamp": 1234567, "accel": {"x": 0.01, "y": -0.02, "z": 1.00}, "gyro": {"x": 0.12, "y": -0.03, "z": 0.05}}
  ]
}
```

| Field | Rule |
|---|---|
| `device_id` | 1–64 chars, `[A-Za-z0-9_-]` |
| `seq` | Batch counter, +1 per batch. Gaps are counted as dropped packets. Going backwards counts as a device reset. |
| `samples` | 1–500 per batch |
| `timestamp` | Device clock, **microseconds**, int, strictly increasing (use `esp_timer_get_time()`, not `micros()`, because `micros()` wraps after ~71 min) |
| `accel` | **g**, each axis within ±16 (firmware full-scale) |
| `gyro` | **deg/s**, each axis within ±2000 (firmware full-scale) |

Units match the current firmware (`raw/2048` → g, `raw/16.4` → dps). If you change the firmware full-scale, update `ACCEL_LIMIT_G` / `GYRO_LIMIT_DPS` in `app.py` too.

Batching: the server does not fix a sample rate or batch size. 100 Hz at ~10 samples per batch is roughly 10 frames/s.

## Raw data

`data/raw/<device_id>_<YYYYmmdd-HHMMSS>.jsonl`: one file per device per server run. Each line is the batch exactly as received, plus `server_time_ms` (Unix ms). It is never modified. Override the folder with the `IMU_RAW_DIR` env var.

## Not yet (later phases)

Calibration, filtering, features, movement detection, quality score, and the Unity game-control channel. Those get their own modules and read from the raw stream; they do not change raw data.
