# IMU Rehab Server

Receives ICM-42688-P data from the ESP32 over Wi-Fi, validates it, logs raw data, shows a live view,
and drives the Godot game (`imu-rehab-game/`) with arm tilt over UDP.

## Run

```bash
cd server
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Windows; use .venv/bin/pip on Linux/macOS
.venv/Scripts/python app.py    # hot-reloads on .py changes; the ESP32 reconnects by itself
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

## Game link (Godot)

Each valid batch updates a tilt estimate ([orientation.py](orientation.py)). The server then sends the latest value to the game,
which listens on UDP 4242 (`imu-rehab-game/main.gd`):

```json
{"pitch": 12.3, "roll": -4.5, "trunk_lean": 0.0}
```

- `pitch` / `roll` are in degrees, from a complementary filter (gyro + accel, `ALPHA = 0.98`). **Assumption, not validated.** Tune it on real movement.
- No yaw: a 6-axis IMU has no absolute heading.
- `trunk_lean` is always 0. There's no trunk IMU, so the game's posture warning never fires from the sensor.
- Press `C` in the game with the arm at rest to zero it.
- Env knobs: `GAME_HOST` / `GAME_PORT` (default `127.0.0.1:4242`), and `GAME_FLIP_PITCH=1` / `GAME_FLIP_ROLL=1` if the cursor moves the wrong way for how the IMU is strapped on.
- The current pitch/roll also show in `/api/status` and on the dashboard. Use them to check axes before playing.

## Not yet (later phases)

Features, movement detection, quality score, adaptive difficulty. Those get their own modules and read from the raw stream; they do not change raw data.
