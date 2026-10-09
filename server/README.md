# IMU Rehab Server

Receives ICM-42688-P data from the ESP32 over Wi-Fi, validates it, logs raw data, shows a live view,
and drives the Godot game (`imu-rehab-game/`) with arm tilt over UDP.

## Run

```bash
cd server
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Windows; use .venv/bin/pip on Linux/macOS
.venv/Scripts/python app.py    # no auto-reload during play; restart it after code changes, or set IMU_RELOAD=1 while developing (the ESP32 reconnects by itself)
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

## Reps and features

**The game defines a rep** (finishing one task repetition, e.g. dial the soil, plant a seed). When a rep finishes the game POSTs
`{"device_id","level","task","rep","duration_s"}` (`level` = the game's level 1-9, one task each) to `POST /api/game_event` ([main.gd](../imu-rehab-game/main.gd) `_report_rep_to_server`).
The server pairs it with the sensor data from the last `duration_s` and returns/stores per game rep: `pitch_range_deg`, `roll_range_deg`,
`peak_speed_dps` (|gyro|), `speed_peaks` (fewer = smoother; peaks of |gyro| smoothed over 0.25 s that stand out by ≥25% of the rep's top speed and ≥ `REST_DPS`; tuned on 6 recorded reps, no ground truth). Saved to `data/processed/<raw name>.gamereps.jsonl`; shown on the dashboard.
Needs the game run from Godot (F5) or re-exported: the prebuilt `IMU_Rehab_Game_F.exe` predates this.

One IMU worn **like a watch** on the back of the wrist, chip up, **-X toward the hand**. A watch moves with the forearm, so this tracks
forearm motion, not the wrist joint: `roll` = pronation/supination (palm down = 0), `pitch` = forearm raise/lower. Flat, palm down: accel x≈0, y≈0, z≈+1.

**Movement attempts** ([features.py](features.py), sensor only): one channel (`IMU_REP_AXIS=roll|pitch`, default `roll`) leaves its neutral by > `ENTER_DEG` and returns within `EXIT_DEG`.
Neutral = first stillness, or `POST /api/zero/<device_id>` (dashboard Zero button); it then stays fixed. Angles are wrap-safe (roll wraps at ±180°).
This is a fine-grained signal for later analysis, NOT the game's rep count. Per attempt: `range_deg`, `peak_excursion_deg`, `direction`, `duration_s`, `peak_speed_dps`, `speed_peaks`.

All thresholds are **unvalidated starting points, not clinical values**. Replay a log through the same pipeline:
`python features.py ../data/raw/<file>.jsonl [pitch|roll] [neutral_deg]`.

## Quality score and adaptive difficulty ([quality.py](quality.py))

Each game rep gets `quality` 0-100 = mean of `timing_score` and `smoothness_score`, each relative to the player's own earlier reps of the
SAME task this session (typical duration / this duration, typical speed peaks / this speed peaks, capped at 100). The first rep of a task has no
reference, so `quality` is `null`. No clinical reference values are used or claimed. Weights, formula and the thresholds below are
**unvalidated placeholders**. The score is not a measure of rehabilitation effectiveness.

Auto level up/down: difficulty = the level number (1-9). When a level's last rep is done, the server takes the mean quality of that level's scored reps
(`level_quality`; rep 1 of a task is unscored) and picks the next level (`next_level()` in quality.py): quality >= 90 -> next level (9 wraps to 1),
quality < 60 -> one level down (floor 1), in between -> repeat the level, no score -> plain next level. The reply to `POST /api/game_event` carries
`quality`, `level_quality` and `next_level` (null except on the level's last rep). The game goes to that level from the report screen ("Next level",
"Repeat level N" or "Go back to level N") and sets cursor gain from the level: 1.25x at level 1 falling linearly to 0.8x at level 9
(`GAIN_EASIEST`/`GAIN_HARDEST` in main.gd). Thresholds are unvalidated placeholders; a player who scores 60-89 repeats a level until they pass or fall below 60
(the number keys 1-9 still jump to any level).
Turn it off with the dashboard button (`POST /api/adapt/off`) or `IMU_ADAPT=0`: the next level is then always the following one. Quality is still computed.

Sensor samples are placed on the server clock by capture time (`ClockMap`: min arrival-minus-device-time offset), not arrival time, because the ESP32 sends queued
batches in a burst after a stall.

`GET /api/session`: per-device summary (reps, mean quality, per-task means, difficulty, link health) plus every rep. The dashboard links to it.

## ESP32 firmware ([IMU_stream.ino](../ESP_32/IMU_stream/IMU_stream.ino))

`loop()` (core 1) only samples the IMU and queues batches; `txTask` (core 0) owns the WebSocket and sends. A Wi-Fi stall delays batches (up to 10 s
buffered, original device timestamps kept) instead of skipping samples. Queue overflow (outage > 10 s) drops the newest batch and shows up as `dropped_packets`.
Also `WiFi.setSleep(false)`. Not compiled or flashed by the author of this change: build, flash, then check the raw log for gaps
(device-clock gaps > 0.2 s) and `sample_rate_hz` ~ 100.

## Not yet (later phases)

Experimentally justified quality formula and thresholds, longer-term (cross-session) baselines, multi-IMU / trunk compensation, ML. Those get their own modules and read from the raw stream; they do not change raw data.
