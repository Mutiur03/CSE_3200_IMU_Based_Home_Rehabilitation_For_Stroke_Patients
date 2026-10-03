# UERG 3D — IMU Upper Extremity Rehabilitation Gardening Game

Godot 4.7 remake of the UERG game from Chen, Huang & Wang, *Developing a digital game for stroke
patients' upper extremity rehabilitation* (Procedia Manufacturing 3, 2015). The original used
Kinect; this version is driven by an IMU over UDP, with mouse/keyboard fallback.

## Levels (from the paper)

| Level       | Brunnstrom stage | Tasks                                              | Trains                            |
| ----------- | ---------------- | -------------------------------------------------- | --------------------------------- |
| 1 Easy      | III–IV          | Dial the soil, pick up seeds to sow, water the pot | Reach-to-grasp, forward extension |
| 2 Medium    | IV–V            | Weeding, deinsectization, photosynthesis           | + shoulder abduction/adduction    |
| 3 Difficult | V–VI            | Block wind, block lightning, receive sunlight      | Coordination, fine control        |

Each task runs 3 repetitions. Paper features implemented:

- **Navigation**: briefing dialog before each level (objective, tasks, posture tips).
- **Feedback**: task timer, encouragement slogans, compensatory-movement warning that pauses the
  game until posture is corrected.
- **Biofeedback**: seedling grows fresh green; turns tan on trunk lean or jerky ("on and off") motion.
- **Recorded data**: per-repetition time, speed, path length, smoothness, posture errors; shown in
  the end-of-level report and exported as JSON to `user://` (Export button).

## Run

Open the folder in Godot 4.7 and press F5, or:

* [ ] 
  ```powershell
  & "C:\path\to\Godot_v4.7.2-stable_win64.exe" --path .
  ```

Keys: `1`/`2`/`3` jump to level, `C` calibrate IMU zero, `M` cycle input mode
(Auto / IMU / Mouse / Keyboard), `T` simulate trunk lean. Keyboard mode: WASD/arrows, Q/E height.

## IMU input

UDP port `4242`, one datagram per sample, either JSON or CSV:

```
{"pitch": 15.0, "roll": -30.0, "yaw": 0.0, "trunk_lean": 2.0}
15.0,-30.0,0.0,2.0
```

`pitch` + = reach forward, `roll` ± = reach right/left (degrees). `trunk_lean` comes from a second
IMU on the chest; above 18° triggers the posture warning (tune `TRUNK_LEAN_THRESHOLD` in `main.gd`,
the paper's therapists found the warning too sensitive).

```powershell
python tools/imu_streamer.py --mode sim                          # synthetic patient, no hardware
python tools/imu_streamer.py --mode serial --serial-port COM3    # MCU prints "pitch,roll[,yaw,lean]"
python tools/imu_streamer.py --mode serial --raw-accel           # MCU prints "ax,ay,az[,lean]"
python tools/imu_streamer.py --selftest
```

Serial mode needs `pip install pyserial`. Use `--flip-pitch` / `--flip-roll` if the sensor is
mounted reversed, and press `C` in-game with the arm at rest to zero it.
