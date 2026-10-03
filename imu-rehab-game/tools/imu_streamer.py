"""Stream IMU orientation to the UERG Godot game over UDP.

Packet (JSON, one per datagram): {"pitch": deg, "roll": deg, "yaw": deg, "trunk_lean": deg}
  pitch      + = forward reach (shoulder flexion / elbow extension)
  roll       + = reach right, - = reach left
  trunk_lean   = torso IMU tilt; > 18 deg triggers the compensatory-movement warning

Modes:
  sim     synthetic patient doing the Level 1 tour (dial soil -> seed -> water), with an
          occasional trunk lean so the posture warning can be tested without hardware.
  serial  forward lines from a microcontroller. Accepted line formats:
            pitch,roll[,yaw[,trunk_lean]]          (angles in degrees, default)
            ax,ay,az[,...]                         (with --raw-accel, accel in any unit)

Usage:
  python tools/imu_streamer.py --mode sim
  python tools/imu_streamer.py --mode serial --serial-port COM3 --baud 115200
  python tools/imu_streamer.py --selftest
"""
import argparse
import json
import math
import socket
import time

# Waypoints (roll, pitch) in degrees, derived from the game's mapping in main.gd:
#   x = roll * 0.016, z = 0.35 - pitch * 0.018
POT = (0.0, 19.4)        # pot centre  (0, *, 0)
SEED = (-30.0, 15.0)     # seed station (-0.48, *, 0.08)
CAN = (30.0, 15.0)       # watering can (0.48, *, 0.08)
POUR = (5.0, 19.4)       # pour point above pot (0.08, *, 0)
REST = (0.0, 0.0)


def accel_to_angles(ax, ay, az):
    """Static tilt from gravity vector -> (pitch, roll) in degrees."""
    pitch = math.degrees(math.atan2(-ax, math.hypot(ay, az)))
    roll = math.degrees(math.atan2(ay, az))
    return pitch, roll


def sim_pose(t):
    """Synthetic Level-1 tour, 30 s loop. Returns (pitch, roll, trunk_lean)."""
    t %= 30.0

    def glide(a, b, u):
        u = 0.5 - 0.5 * math.cos(math.pi * min(max(u, 0.0), 1.0))  # smooth min-jerk-ish ease
        return a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u

    if t < 2:
        r, p = glide(REST, POT, t / 2)
    elif t < 10:  # circular strokes in the pot (dial the soil)
        a = (t - 2) * 2.0
        r, p = POT[0] + 6 * math.cos(a), POT[1] + 4 * math.sin(a)
    elif t < 13:
        r, p = glide(POT, SEED, (t - 10) / 3)
    elif t < 16:
        r, p = glide(SEED, POT, (t - 13) / 3)
    elif t < 19:
        r, p = glide(POT, CAN, (t - 16) / 3)
    elif t < 22:
        r, p = glide(CAN, POUR, (t - 19) / 3)
    elif t < 27:
        r, p = POUR  # hold while pouring
    else:
        r, p = glide(POUR, REST, (t - 27) / 3)
    lean = 25.0 if 13.5 < t < 14.5 else 2.0  # brief compensatory lean mid-transport
    return p, r, lean


def run_sim(sock, addr, hz):
    t0 = time.time()
    while True:
        p, r, lean = sim_pose(time.time() - t0)
        send(sock, addr, p, r, 0.0, lean)
        time.sleep(1.0 / hz)


def run_serial(sock, addr, port, baud, raw_accel, flip_pitch, flip_roll):
    import serial  # pip install pyserial

    with serial.Serial(port, baud, timeout=1) as ser:
        print(f"Reading {port} @ {baud}")
        while True:
            line = ser.readline().decode("ascii", errors="ignore").strip()
            try:
                vals = [float(v) for v in line.split(",")]
            except ValueError:
                continue  # boot banners, partial lines
            if raw_accel:
                if len(vals) < 3:
                    continue
                p, r = accel_to_angles(*vals[:3])
                yaw, lean = 0.0, (vals[3] if len(vals) > 3 else 0.0)
            else:
                if len(vals) < 2:
                    continue
                p, r = vals[0], vals[1]
                yaw = vals[2] if len(vals) > 2 else 0.0
                lean = vals[3] if len(vals) > 3 else 0.0
            # Sensor mounting varies; flip axes instead of re-flashing firmware.
            send(sock, addr, -p if flip_pitch else p, -r if flip_roll else r, yaw, lean)


def send(sock, addr, pitch, roll, yaw, lean):
    msg = {"pitch": round(pitch, 2), "roll": round(roll, 2), "yaw": round(yaw, 2), "trunk_lean": round(lean, 2)}
    sock.sendto(json.dumps(msg).encode(), addr)


def selftest():
    p, r = accel_to_angles(0, 0, 1)
    assert abs(p) < 1e-9 and abs(r) < 1e-9, "flat sensor must read 0,0"
    p, r = accel_to_angles(-1, 0, 0)
    assert abs(p - 90) < 1e-6, "nose-down tilt must read +90 pitch"
    # Every sim waypoint must land inside the game's grab radius (mirrors main.gd).
    to_xz = lambda rp: (rp[0] * 0.016, 0.35 - rp[1] * 0.018)
    for name, wp, target, radius in [
        ("pot", POT, (0.0, 0.0), 0.28),
        ("seed", SEED, (-0.48, 0.08), 0.18),
        ("can", CAN, (0.48, 0.08), 0.20),
        ("pour", POUR, (0.08, 0.0), 0.26),
    ]:
        x, z = to_xz(wp)
        assert math.hypot(x - target[0], z - target[1]) < radius * 0.5, name
    assert sim_pose(14.0)[2] > 18 and sim_pose(5.0)[2] < 18, "lean event window"
    print("selftest ok")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", choices=["sim", "serial"], default="sim")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=4242)
    ap.add_argument("--hz", type=float, default=60.0)
    ap.add_argument("--serial-port", default="COM3")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--raw-accel", action="store_true", help="serial lines are ax,ay,az instead of angles")
    ap.add_argument("--flip-pitch", action="store_true")
    ap.add_argument("--flip-roll", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()

    if a.selftest:
        return selftest()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    addr = (a.host, a.port)
    print(f"Streaming to udp://{a.host}:{a.port} ({a.mode}). Ctrl+C to stop.")
    try:
        if a.mode == "sim":
            run_sim(sock, addr, a.hz)
        else:
            run_serial(sock, addr, a.serial_port, a.baud, a.raw_accel, a.flip_pitch, a.flip_roll)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
