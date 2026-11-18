"""API contract (request/response models). FROZEN after wave 0: the frontend types are generated from the OpenAPI schema
these produce (server/openapi.json -> web/lib/api-types.ts). Change via the main thread, then regenerate both."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["patient", "doctor", "admin"]


# ---- auth / users ----
class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    role: Role
    name: str
    email: str


class UserCreate(BaseModel):
    role: Role
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)
    doctor_id: int | None = None  # patients only
    affected_side: Literal["left", "right"] | None = None
    onset_date: date | None = None


class AssignIn(BaseModel):
    doctor_id: int


class DeviceRegisterIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    patient_id: int | None = None


class DeviceRegisterOut(BaseModel):
    device_id: str
    device_key: str  # shown once; put it in the firmware secrets.h. Only its hash is stored.


class DeviceOut(BaseModel):
    device_id: str
    patient_id: int | None


# ---- plan (doctor prescription; the game reads it) ----
class PlanIn(BaseModel):
    levels_allowed: list[int] = Field(min_length=1)  # game levels 1-9
    reps_per_level: int = Field(ge=1, le=50)
    sessions_per_week: int = Field(ge=0, le=21)
    adapt_on: bool


class PlanOut(PlanIn):
    patient_id: int
    updated_at: datetime | None = None


# ---- sessions / reps ----
class RepOut(BaseModel):
    id: int
    ts: datetime
    level: int
    task: str
    rep: int
    duration_s: float
    pitch_range_deg: float | None
    roll_range_deg: float | None
    peak_speed_dps: float | None
    speed_peaks: int | None
    quality: float | None  # null for a task's first rep (no reference)
    timing_score: float | None
    smoothness_score: float | None


class SessionOut(BaseModel):
    id: int
    patient_id: int
    device_id: str
    started_at: datetime
    ended_at: datetime | None
    n_reps: int | None
    mean_quality: float | None
    dropped_packets: int | None
    sample_rate_hz: float | None
    # per-session means over its reps (for trend charts)
    mean_duration_s: float | None = None
    mean_roll_range_deg: float | None = None
    mean_pitch_range_deg: float | None = None
    mean_speed_peaks: float | None = None


class SessionDetail(SessionOut):
    reps: list[RepOut]


class TracePoint(BaseModel):
    t_s: float  # seconds from session start
    pitch: float  # deg
    roll: float  # deg


class Trace(BaseModel):
    session_id: int
    rate_hz: float
    points: list[TracePoint]


# ---- doctor marking / alerts / messages ----
class Rubric(BaseModel):
    range: int = Field(ge=1, le=5)
    smoothness: int = Field(ge=1, le=5)
    control: int = Field(ge=1, le=5)
    adherence: int = Field(ge=1, le=5)
    overall: int = Field(ge=1, le=5)


class AssessmentIn(BaseModel):
    assessed_on: date
    rubric: Rubric
    scale_name: str | None = Field(default=None, max_length=60)  # e.g. FMA-UE, ARAT (doctor-administered, only stored)
    scale_score: float | None = Field(default=None, allow_inf_nan=False)
    comment: str | None = Field(default=None, max_length=4000)


class AssessmentOut(AssessmentIn):
    id: int
    patient_id: int
    doctor_id: int
    created_at: datetime


class AlertRuleIO(BaseModel):
    max_days_without_session: int | None = Field(default=None, ge=1)  # doctor-chosen; null = rule off
    quality_drop_pct: float | None = Field(default=None, gt=0, le=100)


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class MessageOut(BaseModel):
    id: int
    patient_id: int
    from_user: int
    from_name: str
    body: str
    created_at: datetime
    read_at: datetime | None


# ---- improvement / patient views ----
class MetricChange(BaseModel):
    name: Literal["roll_range", "pitch_range", "duration", "speed_peaks", "quality"]
    baseline: float
    current: float
    improvement_pct: float  # signed so that positive = better (range/quality up, duration/speed_peaks down)


class Improvement(BaseModel):
    baseline_sessions: int  # sessions in the baseline window (first 3)
    current_sessions: int  # sessions in the current window (last 3)
    metrics: list[MetricChange]
    index: float | None  # mean of improvement_pct; null until there are enough sessions
    note: str = "Descriptive, relative to the patient's own baseline. Not clinically validated."


class PatientFlag(BaseModel):
    kind: Literal["no_session", "quality_drop"]
    message: str


class PatientSummary(BaseModel):
    id: int
    name: str
    device_id: str | None
    last_session_at: datetime | None
    sessions_total: int
    mean_quality: float | None
    improvement_index: float | None
    flags: list[PatientFlag]


class PatientDetail(PatientSummary):
    email: str
    doctor_id: int | None
    affected_side: Literal["left", "right"] | None
    onset_date: date | None
    notes: str | None
    plan: PlanOut | None
    alert_rule: AlertRuleIO | None


class Progress(BaseModel):
    """Everything the progress/report pages chart: sessions in time order, the index, and the doctor's marks."""
    patient_id: int
    sessions: list[SessionOut]
    improvement: Improvement
    assessments: list[AssessmentOut]
