"""Postgres schema (SQLAlchemy 2.0). Tiers: raw JSONL stays on disk (sessions.raw_file points to it);
reps = per-rep features; sessions = aggregates; assessments/plans/messages = clinical layer.
FROZEN after wave 0: schema changes go through a new Alembic revision made by the main thread."""
from datetime import date, datetime

from sqlalchemy import (ARRAY, BigInteger, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Integer, String,
                        Text, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _now():
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('patient','doctor','admin')", name="users_role_ck"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    pw_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = _now()


class Patient(Base):
    __tablename__ = "patients"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    affected_side: Mapped[str | None] = mapped_column(String(8))  # left | right
    onset_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # = device_id the firmware sends (e.g. imu_01)
    key_hash: Mapped[str] = mapped_column(String(255))  # hash of the X-Device-Key; the key is shown once at registration
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.user_id"), unique=True)
    registered_at: Mapped[datetime] = _now()


class Plan(Base):
    __tablename__ = "plans"
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.user_id"), primary_key=True)
    levels_allowed: Mapped[list[int]] = mapped_column(ARRAY(Integer))  # game levels 1-9
    reps_per_level: Mapped[int] = mapped_column(Integer)
    sessions_per_week: Mapped[int] = mapped_column(Integer)
    adapt_on: Mapped[bool] = mapped_column(Boolean)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = _now()


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.user_id"), index=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"))
    started_at: Mapped[datetime] = _now()
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw_file: Mapped[str | None] = mapped_column(Text)  # data/raw/<device>_<ts>.jsonl, never modified
    n_reps: Mapped[int | None] = mapped_column(Integer)
    mean_quality: Mapped[float | None] = mapped_column(Float)
    dropped_packets: Mapped[int | None] = mapped_column(Integer)
    sample_rate_hz: Mapped[float | None] = mapped_column(Float)


class Rep(Base):
    """One game rep with the sensor features the server computed for it (same dict game_event builds)."""
    __tablename__ = "reps"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    ts: Mapped[datetime] = _now()
    level: Mapped[int] = mapped_column(Integer)
    task: Mapped[str] = mapped_column(String(100))
    rep: Mapped[int] = mapped_column(Integer)
    duration_s: Mapped[float] = mapped_column(Float)
    pitch_range_deg: Mapped[float | None] = mapped_column(Float)
    roll_range_deg: Mapped[float | None] = mapped_column(Float)
    peak_speed_dps: Mapped[float | None] = mapped_column(Float)
    speed_peaks: Mapped[int | None] = mapped_column(Integer)
    peak_load_kg: Mapped[float | None] = mapped_column(Float)  # max load cell reading in the rep window, game units (counts / LOAD_SCALE); null = no load cell
    quality: Mapped[float | None] = mapped_column(Float)  # null for a task's first rep (no reference)
    timing_score: Mapped[float | None] = mapped_column(Float)
    smoothness_score: Mapped[float | None] = mapped_column(Float)
    level_quality: Mapped[float | None] = mapped_column(Float)
    next_level: Mapped[int | None] = mapped_column(Integer)
    trace: Mapped[dict | None] = mapped_column(JSONB)  # optional downsampled pitch/roll (~20 Hz) for plots


class Assessment(Base):
    """Doctor marking. rubric = {"range":1-5,"smoothness":..,"control":..,"adherence":..,"overall":..}. Stored, never computed."""
    __tablename__ = "assessments"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.user_id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assessed_on: Mapped[date] = mapped_column(Date)
    rubric: Mapped[dict] = mapped_column(JSONB)
    scale_name: Mapped[str | None] = mapped_column(String(60))  # e.g. FMA-UE, ARAT: administered in person by the doctor
    scale_score: Mapped[float | None] = mapped_column(Float)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _now()


class AlertRule(Base):
    """Doctor-chosen thresholds only; the system ships no clinical defaults."""
    __tablename__ = "alert_rules"
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.user_id"), primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    max_days_without_session: Mapped[int | None] = mapped_column(Integer)
    quality_drop_pct: Mapped[float | None] = mapped_column(Float)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.user_id"), index=True)
    from_user: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = _now()
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(40))  # view | create | update | login ...
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    at: Mapped[datetime] = _now()
