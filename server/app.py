"""IMU ingestion server (Phase 2-3).

ESP32 --(WS /ws/imu or POST /api/imu)--> validate --> raw JSONL log + live broadcast (/ws/live).
No processing/assessment yet; raw data is never modified.
"""
import json
import os
import time
from collections import deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

# Sensor full-scale from firmware config (ESP_32/IMU_test: ACCEL_CONFIG0=0x08, GYRO_CONFIG0=0x08).
# Change these if firmware FS changes. These are sensor limits, not clinical thresholds.
ACCEL_LIMIT_G = 16.0
GYRO_LIMIT_DPS = 2000.0
RAW_DIR = Path(os.environ.get("IMU_RAW_DIR", Path(__file__).resolve().parent.parent / "data" / "raw"))
RATE_WINDOW = 200  # samples used to estimate sample rate


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


class Device:
    def __init__(self, device_id: str):
        self.packets = self.samples = self.dropped = self.resets = 0
        self.last_seq = None
        self.last_seen = None
        self.connected = False
        self.times = deque(maxlen=RATE_WINDOW)
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        self.path = RAW_DIR / f"{device_id}_{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
        self.log = self.path.open("a", buffering=1)  # line-buffered: a crash loses at most one line

    def update(self, batch: Batch, received_ms: int):
        first_t = batch.samples[0].timestamp
        if self.last_seq is not None and (batch.seq <= self.last_seq or (self.times and first_t <= self.times[-1])):
            # seq/clock went backwards: device rebooted (or reordered packet). Restart rate estimate.
            self.resets += 1
            self.times.clear()
        elif self.last_seq is not None:
            self.dropped += batch.seq - self.last_seq - 1
        self.last_seq = batch.seq
        self.last_seen = received_ms
        self.packets += 1
        self.samples += len(batch.samples)
        self.times.extend(s.timestamp for s in batch.samples)

    def stats(self) -> dict:
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

    msg = json.dumps({"device_id": batch.device_id, "samples": batch.model_dump()["samples"], "stats": dev.stats()})
    # ponytail: sequential sends; a stalled viewer delays ingestion. Move to per-client queues if that bites.
    for ws in list(live_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            live_clients.discard(ws)
    return batch


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
