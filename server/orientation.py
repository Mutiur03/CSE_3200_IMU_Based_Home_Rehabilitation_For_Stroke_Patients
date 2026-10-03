"""Tilt (pitch, roll) from one IMU, for the game cursor.

Complementary filter: integrate gyro for responsiveness, pull toward accel tilt to cancel drift.
ASSUMPTION, not validated: the method and ALPHA are a starting point. Tune on real arm movement.

Axes match imu-rehab-game/tools/imu_streamer.py accel_to_angles:
  pitch = rotation about sensor Y (rate gyro.y), roll = rotation about sensor X (rate gyro.x).
No yaw: one 6-axis IMU has no absolute heading, and integrated gyro z just drifts.
"""
import math

ALPHA = 0.98  # gyro weight per sample at ~100 Hz. Higher = smoother, slower drift correction.
MAX_GAP_S = 0.5  # longer gap (lost packets, reboot) -> restart from accel instead of integrating


def accel_to_angles(ax, ay, az):
    """Static tilt from gravity (g units) -> (pitch, roll) in degrees."""
    return math.degrees(math.atan2(-ax, math.hypot(ay, az))), math.degrees(math.atan2(ay, az))


class Tilt:
    # ponytail: roll wraps at ±180 (sensor upside down) and pitch/roll couple near ±90.
    # Fine for tabletop reaching; switch to a quaternion filter (Madgwick) if the arm goes past that.
    def __init__(self):
        self.pitch = self.roll = self.t = None

    def update(self, t_us, ax, ay, az, gx, gy):
        acc_pitch, acc_roll = accel_to_angles(ax, ay, az)
        dt = (t_us - self.t) / 1e6 if self.t is not None else None
        if dt is None or not 0 < dt <= MAX_GAP_S:
            self.pitch, self.roll = acc_pitch, acc_roll
        else:
            self.pitch = ALPHA * (self.pitch + gy * dt) + (1 - ALPHA) * acc_pitch
            self.roll = ALPHA * (self.roll + gx * dt) + (1 - ALPHA) * acc_roll
        self.t = t_us
        return self.pitch, self.roll
