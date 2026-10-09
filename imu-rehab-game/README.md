# UERG 3D — IMU Upper Extremity Rehabilitation Gardening Game

Godot 4.7 remake of the UERG game from Chen, Huang & Wang, *Developing a digital game for stroke
patients' upper extremity rehabilitation* (Procedia Manufacturing 3, 2015). The original used
Kinect; this version is driven by an IMU over UDP, with mouse/keyboard fallback.

## Levels (from the paper): 9 levels, one task each

Each of the paper's three tasks per difficulty group is its own level, so the game has 9 levels of 3 repetitions each. Finishing a level shows
its own report, then "Next level" (level 9 goes back to level 1).

| Levels | Group (Brunnstrom stage) | Tasks, one per level                                          | Trains                            |
| ------ | ------------------------ | ------------------------------------------------------------- | --------------------------------- |
| 1-3    | Easy (III-IV)            | 1 Dial the soil, 2 Pick up seeds to sow, 3 Water the pot      | Reach-to-grasp, forward extension |
| 4-6    | Medium (IV-V)            | 4 Weeding, 5 Deinsectization, 6 Photosynthesis                | + shoulder abduction/adduction    |
| 7-9    | Difficult (V-VI)         | 7 Block wind, 8 Block lightning, 9 Receive sunlight           | Coordination, fine control        |

Paper features implemented:

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

Keys: `1`-`9` jump to that level, `C` calibrate IMU zero, `M` cycle input mode
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

## Server link (rep reporting and adaptive difficulty)

After each repetition the game POSTs it to the IMU server (`SERVER_EVENT_URL` in `main.gd`, default `http://127.0.0.1:8000/api/game_event`).
The reply carries `quality`, `level_quality` and, after a level's last rep, `next_level`. The report screen then offers "Next level", "Repeat level N" or "Go back to level N" by quality (see server/README.md), and cursor gain follows the level (1.25x at level 1 down to 0.8x at level 9). If the server is not running, the game just goes to the next level. Run the game from the Godot editor: the prebuilt `.exe` in the repo root predates this.
