"""IMU ingestion server.

ESP32 --(WS /ws/imu or POST /api/imu)--> validate --> raw JSONL log + live broadcast (/ws/live)
                                                  --> tilt (orientation.py) --> UDP to Godot game
Raw data is never modified.
"""
import json
import math
import os
import socket
import time
from collections import deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from features import ENTER_DEG, EXIT_DEG, WristReps, diff, pick, window_features
from orientation import Tilt
from quality import N_LEVELS, Q_DOWN, Q_UP, level_quality, next_level, score

# Sensor full-scale from firmware config (ESP_32/IMU_test: ACCEL_CONFIG0=0x08, GYRO_CONFIG0=0x08).
# Change these if firmware FS changes. These are sensor limits, not clinical thresholds.
ACCEL_LIMIT_G = 16.0
GYRO_LIMIT_DPS = 2000.0
RAW_DIR = Path(os.environ.get("IMU_RAW_DIR", Path(__file__).resolve().parent.parent / "data" / "raw"))
PROCESSED_DIR = Path(os.environ.get("IMU_PROCESSED_DIR", RAW_DIR.parent / "processed"))  # derived reps, never mixed with raw
ADAPT = os.environ.get("IMU_ADAPT", "1") == "1"  # choose the next level from quality (else fixed progression); dashboard toggle
REP_AXIS = os.environ.get("IMU_REP_AXIS", "roll")  # roll = pronation/supination, pitch = forearm raise/lower (features.py)
RATE_WINDOW = 200  # samples used to estimate sample rate

# Godot game (imu-rehab-game/main.gd) listens on UDP 4242 for {"pitch", "roll", "trunk_lean"} in degrees.
GAME_ADDR = (os.environ.get("GAME_HOST", "127.0.0.1"), int(os.environ.get("GAME_PORT", "4242")))
# Mounting knobs: set to 1 if reaching forward/right moves the cursor the wrong way.
FLIP_PITCH = os.environ.get("GAME_FLIP_PITCH") == "1"
FLIP_ROLL = os.environ.get("GAME_FLIP_ROLL") == "1"
game_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)


class Vec3(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    x: float
    y: float
    z: float


class Sample(BaseModel):
    timestamp: int = Field(ge=0)  # device clock, microseconds (esp_timer_get_time)
    accel: Vec3  # g
    gyro: Vec3  # deg/s

    @field_validator("accel")
    @classmethod
    def accel_in_range(cls, v):
        if max(abs(v.x), abs(v.y), abs(v.z)) > ACCEL_LIMIT_G:
            raise ValueError(f"accel exceeds ±{ACCEL_LIMIT_G} g")
        return v

    @field_validator("gyro")
    @classmethod
    def gyro_in_range(cls, v):
        if max(abs(v.x), abs(v.y), abs(v.z)) > GYRO_LIMIT_DPS:
            raise ValueError(f"gyro exceeds ±{GYRO_LIMIT_DPS} dps")
        return v


class Batch(BaseModel):
    device_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    seq: int = Field(ge=0)  # increments by 1 per batch; gaps = lost packets
    samples: list[Sample] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def timestamps_increase(self):
        ts = [s.timestamp for s in self.samples]
        if any(b <= a for a, b in zip(ts, ts[1:])):
            raise ValueError("sample timestamps must strictly increase")
        return self


class ClockMap:
    """Device clock (us) -> server wall clock (ms). The ESP32 queues batches during Wi-Fi stalls and sends them in a
    burst, so arrival time is not capture time. offset = min over recent batches of (arrival - device time): the
    least-delayed batch shows the true offset, later ones are just late. Reset when the device reboots."""

    def __init__(self):
        self.offsets = deque(maxlen=3000)  # ~5 min of batches

    def add(self, received_ms, device_us):
        self.offsets.append(received_ms - device_us / 1000)

    def wall(self, device_us):
        return device_us / 1000 + min(self.offsets)


class Device:
    def __init__(self, device_id: str):
        self.packets = self.samples = self.dropped = self.resets = 0
        self.last_seq = None
        self.last_seen = None
        self.connected = False
        self.times = deque(maxlen=RATE_WINDOW)
        self.tilt = Tilt()
        self.reps = WristReps()
        self.last_rep = None
        self.clock = ClockMap()
        self.buf = deque(maxlen=6000)  # (wall_ms, pitch, roll, |gyro|) ~60 s at 100 Hz, to pair sensor data with game events
        self.game_reps = []
        self.run = []  # reps of the level being played now
        self.level = 1  # game level (1-9) of the last reported rep
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        self.path = RAW_DIR / f"{device_id}_{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
        self.log = self.path.open("a", buffering=1)  # line-buffered: a crash loses at most one line
        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
        self.reps_log = (PROCESSED_DIR / (self.path.stem + ".reps.jsonl")).open("a", buffering=1)
        self.game_log = (PROCESSED_DIR / (self.path.stem + ".gamereps.jsonl")).open("a", buffering=1)

    def update(self, batch: Batch, received_ms: int):
        first_t = batch.samples[0].timestamp
        if self.last_seq is not None and (batch.seq <= self.last_seq or (self.times and first_t <= self.times[-1])):
            # seq/clock went backwards: device rebooted (or reordered packet). Restart rate estimate.
            self.resets += 1
            self.times.clear()
            self.tilt = Tilt()
            self.reps = WristReps()
            self.clock = ClockMap()
        elif self.last_seq is not None:
            self.dropped += batch.seq - self.last_seq - 1
        self.last_seq = batch.seq
        self.clock.add(received_ms, batch.samples[-1].timestamp)
        self.last_seen = received_ms
        self.packets += 1
        self.samples += len(batch.samples)
        self.times.extend(s.timestamp for s in batch.samples)
        for s in batch.samples:
            pitch, roll = self.tilt.update(s.timestamp, s.accel.x, s.accel.y, s.accel.z, s.gyro.x, s.gyro.y)
            wall_ms = self.clock.wall(s.timestamp)
            self.buf.append((wall_ms, pitch, roll, math.sqrt(s.gyro.x**2 + s.gyro.y**2 + s.gyro.z**2)))
            rep = self.reps.update(s.timestamp, *pick(REP_AXIS, pitch, roll, s.gyro.x, s.gyro.y))
            if rep:
                self.last_rep = rep
                self.reps_log.write(json.dumps(rep) + "\n")

    def angle(self):
        """Current angle on the rep axis (deg), or None before data."""
        return self.tilt.pitch if REP_AXIS == "pitch" else self.tilt.roll

    def stats(self) -> dict:
        ang = self.angle()
        span = self.times[-1] - self.times[0] if len(self.times) > 1 else 0
        return {
            "connected": self.connected,
            "packets": self.packets,
            "samples": self.samples,
            "dropped_packets": self.dropped,
            "resets": self.resets,
            "last_seq": self.last_seq,
            "last_seen_ms": self.last_seen,
            "sample_rate_hz": round((len(self.times) - 1) * 1e6 / span, 2) if span else None,
            "pitch_deg": round(self.tilt.pitch, 2) if self.tilt.pitch is not None else None,
            "roll_deg": round(self.tilt.roll, 2) if self.tilt.roll is not None else None,
            "rep_axis": REP_AXIS,
            "angle_deg": round(ang, 2) if ang is not None else None,
            "delta_deg": round(diff(ang, self.reps.neutral), 2) if ang is not None and self.reps.neutral is not None else None,
            "enter_deg": ENTER_DEG,
            "exit_deg": EXIT_DEG,
            "attempts": self.reps.attempts,
            "rep_neutral_deg": round(self.reps.neutral, 2) if self.reps.neutral is not None else None,
            "last_rep": self.last_rep,
            "game_rep_count": len(self.game_reps),
            "last_game_rep": self.game_reps[-1] if self.game_reps else None,
            "level": self.level,
            "adapt": ADAPT,
            "raw_log": str(self.path),
        }


devices: dict[str, Device] = {}
invalid_packets = 0
live_clients: set[WebSocket] = set()
app = FastAPI(title="IMU Rehab Server")


async def ingest(raw: str | bytes, via_ws: bool = False) -> Batch:
    global invalid_packets
    try:
        batch = Batch.model_validate_json(raw)
    except ValidationError:
        invalid_packets += 1
        raise
    received_ms = int(time.time() * 1000)
    dev = devices.get(batch.device_id) or devices.setdefault(batch.device_id, Device(batch.device_id))
    dev.update(batch, received_ms)
    dev.connected = dev.connected or via_ws
    dev.log.write(json.dumps({"server_time_ms": received_ms, **batch.model_dump()}) + "\n")
    send_to_game(dev)

    msg = json.dumps({"device_id": batch.device_id, "samples": batch.model_dump()["samples"], "stats": dev.stats()})
    # ponytail: sequential sends; a stalled viewer delays ingestion. Move to per-client queues if that bites.
    for ws in list(live_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            live_clients.discard(ws)
    return batch


def send_to_game(dev: Device):
    # Latest tilt only: the game keeps just the newest packet per frame anyway.
    # trunk_lean = 0: no trunk IMU yet, so the game's posture warning stays off (no compensation claims).
    pitch, roll = dev.tilt.pitch, dev.tilt.roll
    msg = {"pitch": round(-pitch if FLIP_PITCH else pitch, 2), "roll": round(-roll if FLIP_ROLL else roll, 2), "trunk_lean": 0.0}
    try:
        game_sock.sendto(json.dumps(msg).encode(), GAME_ADDR)
    except OSError:
        pass  # game not running must never break ingestion


@app.websocket("/ws/imu")
async def imu_stream(ws: WebSocket):
    await ws.accept()
    dev = None
    try:
        while True:
            try:
                batch = await ingest(await ws.receive_text(), via_ws=True)
            except ValidationError as e:
                await ws.send_json({"error": e.errors(include_url=False, include_context=False)})
                continue
            dev = devices[batch.device_id]
    except WebSocketDisconnect:
        pass
    finally:
        if dev:
            dev.connected = False


@app.post("/api/imu")
async def imu_post(request: Request):
    try:
        batch = await ingest(await request.body())
    except ValidationError as e:
        raise HTTPException(422, e.errors(include_url=False, include_context=False))
    return {"ok": True, "samples": len(batch.samples)}


class GameEvent(BaseModel):
    device_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    level: int = Field(ge=1, le=9)  # the game's level, 1-9 (one task each)
    task: str = Field(max_length=100)
    rep: int  # repetition number within the level, as the game counts it
    reps_required: int = Field(default=3, ge=1, le=50)  # reps that finish a level
    duration_s: float = Field(gt=0, le=600)  # game-measured rep duration; window = the last duration_s before this event


@app.post("/api/game_event")
def game_event(ev: GameEvent):
    """The game finished a rep. Pair it with the sensor features over that rep's time window."""
    dev = devices.get(ev.device_id)
    if dev is None:
        raise HTTPException(404, "unknown device")
    now = int(time.time() * 1000)
    win = [b for b in dev.buf if now - ev.duration_s * 1000 <= b[0] <= now]
    rep = {
        "game_rep": len(dev.game_reps) + 1,
        "level": ev.level,
        "task": ev.task,
        "rep": ev.rep,
        "duration_s": round(ev.duration_s, 2),
        **window_features([b[1] for b in win], [b[2] for b in win], [b[3] for b in win]),
    }
    q = score(rep, dev.game_reps)
    rep.update(q or {"quality": None, "timing_score": None, "smoothness_score": None})
    dev.level = ev.level
    if ev.rep == 1:
        dev.run = []  # a new play of this level starts
    dev.run.append(rep)
    rep["level_quality"] = level_quality(dev.run)
    rep["next_level"] = None  # only decided when the level's last rep is done
    if ev.rep >= ev.reps_required:
        rep["next_level"] = next_level(ev.level, rep["level_quality"]) if ADAPT else ev.level % N_LEVELS + 1
        # What the game needs to explain the decision to the player:
        rep["scored_reps"] = sum(1 for r in dev.run if r["quality"] is not None)
        rep["q_up"], rep["q_down"], rep["adapt"] = Q_UP, Q_DOWN, ADAPT
    dev.game_reps.append(rep)
    dev.game_log.write(json.dumps({"server_time_ms": now, **rep}) + "\n")
    return {"ok": True, **rep}


@app.post("/api/zero/{device_id}")
def zero(device_id: str):
    """Calibrate: the current pose becomes the neutral for rep detection. Hold the arm at rest first."""
    dev = devices.get(device_id)
    if dev is None or dev.tilt.pitch is None:
        raise HTTPException(404, "no data from that device yet")
    angle = dev.angle()
    dev.reps.zero(angle)
    return {"ok": True, "neutral_deg": round(angle, 2)}


@app.post("/api/reps/reset/{device_id}")
def reset_reps(device_id: str):
    """Zero the rep counter, keep the neutral."""
    dev = devices.get(device_id)
    if dev is None:
        raise HTTPException(404, "unknown device")
    neutral = dev.reps.neutral
    dev.reps, dev.last_rep = WristReps(), None
    dev.reps.neutral = neutral
    dev.game_reps.clear()
    dev.run = []
    return {"ok": True}


@app.post("/api/adapt/{mode}")
def set_adapt(mode: str):
    """Turn quality-driven level choice on or off (off = always go to the next level; quality is still computed)."""
    global ADAPT
    if mode not in ("on", "off"):
        raise HTTPException(422, "mode must be on or off")
    ADAPT = mode == "on"
    return {"ok": True, "adapt": ADAPT}


@app.get("/api/session")
def session():
    """Per-device session summary from the game reps so far, plus link health."""
    out = {}
    for k, d in devices.items():
        tasks = {}
        for r in d.game_reps:
            t = tasks.setdefault(r["task"], [])
            t.append(r)
        mean = lambda xs: round(sum(xs) / len(xs), 2) if xs else None  # noqa: E731
        qs = [r["quality"] for r in d.game_reps if r["quality"] is not None]
        out[k] = {
            "game_reps": len(d.game_reps),
            "mean_quality": mean(qs),
            "level": d.level,
            "tasks": {
                name: {
                    "reps": len(rs),
                    "mean_duration_s": mean([r["duration_s"] for r in rs]),
                    "mean_roll_range_deg": mean([r["roll_range_deg"] for r in rs]),
                    "mean_pitch_range_deg": mean([r["pitch_range_deg"] for r in rs]),
                    "mean_speed_peaks": mean([r["speed_peaks"] for r in rs]),
                    "mean_quality": mean([r["quality"] for r in rs if r["quality"] is not None]),
                }
                for name, rs in tasks.items()
            },
            "link": {k2: d.stats()[k2] for k2 in ("samples", "dropped_packets", "resets", "sample_rate_hz")},
            "reps": d.game_reps,
        }
    return out


@app.post("/api/axis/{axis}")
def set_axis(axis: str):
    """Switch the rep channel for all devices. Neutral is cleared (re-set on stillness or Zero)."""
    global REP_AXIS
    if axis not in ("roll", "pitch"):
        raise HTTPException(422, "axis must be roll or pitch")
    REP_AXIS = axis
    for dev in devices.values():
        dev.reps, dev.last_rep = WristReps(), None
    return {"ok": True, "axis": axis}


@app.get("/api/status")
def status():
    return {
        "server_time_ms": int(time.time() * 1000),
        "invalid_packets": invalid_packets,
        "devices": {k: d.stats() for k, d in devices.items()},
    }


@app.websocket("/ws/live")
async def live(ws: WebSocket):
    await ws.accept()
    live_clients.add(ws)
    try:
        while True:
            await ws.receive_text()  # keep open; viewers don't send anything meaningful
    except WebSocketDisconnect:
        live_clients.discard(ws)


@app.get("/")
def dashboard():
    return FileResponse(Path(__file__).parent / "dashboard.html")


if __name__ == "__main__":
    import uvicorn

    # 0.0.0.0 so the ESP32 can reach it on the LAN. Reload is opt-in (IMU_RELOAD=1): a restart mid-session drops the
    # ESP32 link and clears the dashboard counters (the ESP32 reconnects by itself, but buffers only ~4 s).
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=os.environ.get("IMU_RELOAD") == "1")
