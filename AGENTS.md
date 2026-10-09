# AGENTS.md

## Project: CSE 3200 — IMU-Based Serious Game for Home Stroke Rehabilitation

This file is the authoritative project context for AI coding/development agents working on this repository.

---

> **Implementation note (2026-10-03):** the game is currently a **Godot 4** project in `imu-rehab-game/`,
> not Unity. Wherever this document says "Unity", read "the game client". The server sends tilt to it over
> **UDP 4242** as `{"pitch", "roll", "trunk_lean"}` (degrees). See `server/README.md`.

> **Implementation note (2026-10-09):** the sensor is worn **like a watch** on the back of the wrist (chip up, -X toward the hand), so it tracks
> forearm motion (roll = pronation/supination, pitch = forearm raise/lower), not the wrist joint. The **game defines a rep**; it POSTs each finished
> rep to `POST /api/game_event` and the server pairs it with sensor features, a movement-quality score and an adaptive difficulty level, returned in
> the reply; after a level's last rep it also returns which level to play next (up / repeat / down from mean quality), and difficulty = level number applied as cursor gain. Quality/adaptation constants are unvalidated placeholders (`server/quality.py`). Firmware samples
> and sends in separate tasks. See `server/README.md`.

---

## 1. Project Goal

Build a low-cost serious-game prototype for upper-limb stroke rehabilitation.

The current prototype uses **one wearable IMU node**. The node measures movement using an **ICM-42688-P** connected to an **ESP32**. The ESP32 sends sensor data over **Wi-Fi directly to the project's server endpoint**. The server processes the data and communicates movement/assessment results to a **Unity 3D rehabilitation game**.

The long-term research direction may expand to multiple IMUs on the wrist, forearm, upper arm, and optionally trunk, but the current implementation must remain focused on a **single IMU**.

---

## 2. Current Hardware

### Wearable Node

- MCU: **ESP32**
- IMU: **ICM-42688-P**
- IMU measurements:
  - 3-axis accelerometer
  - 3-axis gyroscope
- Wireless communication: **Wi-Fi**
- Server communication: **HTTP and/or WebSocket**, according to the backend implementation
- Current number of IMUs: **1**

### Current physical connection

Initial implementation should use I2C unless the hardware design explicitly requires SPI.

Typical ESP32 I2C mapping:

```text
ICM-42688-P       ESP32
------------      -----
VCC / 3.3V   ->   3.3V
GND          ->   GND
SDA          ->   GPIO 21
SCL          ->   GPIO 22
INT1         ->   Optional GPIO
```

Do not assume the above power/pin arrangement is valid for every ICM-42688-P breakout. Verify the exact module before final hardware documentation or deployment.

### Important

- Do **not** introduce Arduino Nano 33 BLE Sense into the current implementation.
- Do **not** use Bluetooth/BLE.
- Do **not** design around multiple IMUs yet.
- Do **not** assume the ICM-42688-P is an onboard ESP32 sensor.
- Do **not** connect a bare ICM-42688-P chip directly to an inappropriate supply voltage.
- The exact ESP32 board and ICM-42688-P breakout/module must determine the final physical wiring.

---

## 3. Current System Architecture

The current end-to-end architecture is:

```text
ICM-42688-P
     |
     | I2C / SPI
     v
   ESP32
     |
     | Wi-Fi
     v
Server Endpoint
     |
     +--> Data Ingestion
     |
     +--> Validation / Timestamp Handling
     |
     +--> Calibration
     |
     +--> Filtering / Signal Processing
     |
     +--> Feature Extraction
     |
     +--> Movement Assessment
     |
     +--> Movement Quality Score
     |
     +--> Game-Control Data
     |
     v
Unity 3D Game
     |
     +--> Player/Game Movement
     +--> Feedback
     +--> Score
     +--> Adaptive Difficulty
     |
     v
Session Metrics / Report
```

The key communication chain is:

**ICM-42688-P → ESP32 → Wi-Fi → Server → Unity 3D**

There is no Bluetooth stage.

---

## 4. Five-Layer Architecture

The project follows these logical layers:

### Layer 1 — Wearable Layer

Current implementation:

```text
ICM-42688-P + ESP32
```

Responsibilities:

- Acquire accelerometer data.
- Acquire gyroscope data.
- Timestamp measurements.
- Identify the device.
- Maintain Wi-Fi connectivity.
- Transmit sensor data.

The ESP32 should remain relatively lightweight. Heavy movement analysis should initially be performed server-side.

### Layer 2 — Data Acquisition Layer

Responsibilities:

- Receive ESP32 data.
- Validate packets.
- Check timestamps.
- Detect missing/invalid data.
- Maintain the incoming sensor stream.
- Prepare data for processing.

### Layer 3 — Processing Layer

Responsibilities:

- Calibration.
- Filtering.
- Signal conditioning.
- Drift handling where applicable.
- Feature extraction.

Potential features:

- Angular velocity.
- Movement range.
- Smoothness.
- Timing.
- Repetition count.

### Layer 4 — Assessment Layer

Responsibilities:

- Detect movement attempts.
- Classify movement state where supported.
- Produce a movement-quality score.
- Distinguish correct/incomplete movement when the implemented exercise supports it.

Possible states:

```text
Correct
Incomplete
Compensatory
```

However, **compensatory movement detection must not be claimed as currently implemented with one IMU unless a validated method has actually been developed**. The research architecture uses additional sensor information, especially a trunk reference, for compensation assessment.

### Layer 5 — Application Layer

Unity 3D is responsible for:

- Rehabilitation gameplay.
- Mapping recognized movement to game actions.
- Visual feedback.
- Audio feedback where appropriate.
- Score display.
- Adaptive difficulty.
- Session/game metrics.

---

## 5. Current Data Flow

The ESP32 should transmit raw or minimally processed sensor data.

Example logical payload:

```json
{
  "device_id": "imu_01",
  "timestamp": 1727845212345,
  "accel": {
    "x": 0.21,
    "y": -0.43,
    "z": 9.72
  },
  "gyro": {
    "x": 1.24,
    "y": -0.37,
    "z": 0.15
  }
}
```

The exact JSON schema must be defined centrally and kept consistent between firmware and server.

For high-frequency streaming, avoid making a separate HTTP request for every individual sensor sample if that creates excessive overhead. Use an appropriate streaming or batching mechanism.

For real-time gameplay, WebSocket is a suitable architecture when supported by the backend:

```text
ESP32
  |
  | Wi-Fi
  v
Server
  |
  | WebSocket
  v
Unity
```

HTTP POST can be used for simple ingestion/testing or batched data.

---

## 6. ESP32 Firmware Responsibilities

The firmware should follow this general sequence:

```text
Start
 |
 v
Initialize ICM-42688-P
 |
 v
Configure sensor
 |
 v
Initialize Wi-Fi
 |
 v
Connect to server
 |
 v
Read accelerometer + gyroscope
 |
 v
Attach timestamp + device ID
 |
 v
Create packet
 |
 v
Transmit to server
 |
 +------> Repeat
```

The firmware should include:

- Sensor initialization.
- Sensor configuration.
- Sampling loop.
- Timestamp generation.
- Wi-Fi connection management.
- Server connection management.
- Packet creation.
- Transmission.
- Basic error/reconnection handling.
- Optional local buffering if required later.

Do not move complex ML inference to the ESP32 unless there is a specific later requirement.

---

## 7. Server Responsibilities

The server is the main processing layer.

Recommended logical pipeline:

```text
Incoming Sensor Data
        |
        v
Packet Validation
        |
        v
Timestamp Handling
        |
        v
Calibration
        |
        v
Filtering
        |
        v
Feature Extraction
        |
        v
Movement Detection
        |
        v
Movement Assessment
        |
        v
Movement Quality Score
        |
        v
Game-Control Event
        |
        v
Unity
```

The server should separate:

1. Raw sensor data.
2. Processed sensor data.
3. Extracted features.
4. Assessment results.
5. Game state/events.
6. Session metrics.

Do not overwrite raw sensor data with processed values.

---

## 8. Unity Responsibilities

Unity should not directly depend on the physical ICM-42688-P.

Unity receives processed/game-control information from the server.

Example:

```json
{
  "movement": "reach_forward",
  "quality": 82,
  "progress": 0.74,
  "difficulty": 2
}
```

Unity then translates this into:

- Character movement.
- Target interaction.
- Object collection.
- Progress.
- Score.
- Feedback.
- Difficulty adjustment.

The game should prioritize controlled rehabilitation movement rather than fast reflexes.

---

## 9. Adaptive Game Logic

The intended closed loop is:

```text
Patient Movement
      |
      v
     IMU
      |
      v
Sensor Data
      |
      v
Feature Extraction
      |
      v
Movement Assessment
      |
      v
Movement Quality
      |
      v
Unity Game
      |
      v
Feedback / Difficulty
      |
      v
Patient Movement
```

Higher-quality movement can be used to increase task difficulty.

Poor, incomplete, or unstable movement can be used to:

- Reduce difficulty.
- Provide corrective feedback.
- Pause/slow progression.
- Suggest rest when the implemented logic supports it.

Do not hard-code clinically meaningful thresholds without experimental justification or appropriate clinical guidance.

---

## 10. Current Development Strategy

Build incrementally.

### Phase 1 — Hardware Validation

Goal:

```text
ICM-42688-P -> ESP32
```

Verify:

- Accelerometer values.
- Gyroscope values.
- Sampling stability.
- Sensor orientation.
- Correct wiring.

### Phase 2 — Wi-Fi Streaming

Goal:

```text
ICM-42688-P
      |
    ESP32
      |
    Wi-Fi
      |
    Server
```

Verify:

- Connectivity.
- Packet format.
- Timestamping.
- Packet loss.
- Reconnection.

### Phase 3 — Server Visualization

Display:

- ax, ay, az
- gx, gy, gz
- timestamps
- sample rate
- connection status

Do this before implementing complex assessment.

### Phase 4 — Feature Extraction

Implement and validate:

- Angular velocity.
- Movement range.
- Timing.
- Smoothness.
- Repetition detection.

### Phase 5 — Movement Detection

Start with interpretable rules and thresholds.

Do not introduce machine learning before the basic sensor and feature pipeline is reliable.

### Phase 6 — Unity Integration

Connect processed movement information to the existing 3D game.

### Phase 7 — Quality Scoring

Develop and experimentally validate a movement-quality score.

### Phase 8 — Adaptive Difficulty

Use the quality score to adjust the game gradually.

### Phase 9 — Future Multi-IMU Expansion

Only after the single-IMU pipeline is stable:

```text
Wrist
Forearm
Upper Arm
Optional Trunk
```

Then implement multi-sensor synchronization and compensation analysis.

---

## 11. Research Alignment

The supplied project research specifies a wearable IMU system intended to estimate:

- Movement speed.
- Range.
- Smoothness.
- Timing.
- Repetitions.
- Possible compensatory movement.

It describes a five-layer architecture:

1. Wearable.
2. Acquisition.
3. Processing.
4. Assessment.
5. Application.

It also specifies a real-time pipeline from IMUs through wireless collection, calibration/synchronization, feature extraction, quality assessment, adaptive game control, and feedback.

The current single-IMU ESP32 implementation is the **first technical prototype** of that larger architecture.

The supplied research explicitly leaves several implementation decisions open, including:

- Exact hardware.
- Communication protocol.
- Sampling rate.
- Filtering.
- Sensor-fusion method.
- Movement-quality formula.
- Machine-learning architecture.
- Target rehabilitation exercises.
- Clinical thresholds.

These must be established through implementation and experimentation rather than invented as fixed requirements.

---

## 12. Important Scope Limitations

### Do not claim clinical effectiveness

A technically working prototype does not demonstrate rehabilitation effectiveness.

Testing should initially establish technical feasibility with controlled experiments. Clinical conclusions require appropriate stroke-survivor validation and clinical supervision.

### Do not claim compensation detection with one IMU without evidence

A single IMU can provide useful movement information, but the project's proposed multi-sensor architecture uses additional body-segment information, including an optional trunk sensor, to assess compensation.

### Do not invent clinical thresholds

Any threshold for:

- Normal/abnormal movement.
- Rehabilitation quality.
- Rest recommendation.
- Patient severity.
- Therapeutic progression.

must be experimentally or clinically justified.

---

## 13. Coding Rules for Agents

When modifying this project:

1. Preserve the current architecture unless a change is explicitly requested.
2. Treat **ESP32 + ICM-42688-P + Wi-Fi + server endpoint + Unity** as the current hardware/software stack.
3. Never add Bluetooth/BLE unless explicitly requested.
4. Never replace the ESP32 with Arduino Nano 33 BLE Sense unless explicitly requested.
5. Assume **one IMU** unless the task explicitly asks for multi-IMU support.
6. Keep hardware-specific code separate from server processing.
7. Keep raw sensor data available for debugging and research.
8. Use timestamps consistently.
9. Include a device/sensor ID in streamed data.
10. Validate incoming data before processing.
11. Do not silently invent sampling rates, clinical thresholds, scoring formulas, or sensor-fusion algorithms.
12. Prefer simple interpretable rules before machine learning.
13. Keep ML components modular so they can be replaced later.
14. Do not break the server API contract without updating all clients.
15. Do not couple Unity directly to the physical sensor.
16. Keep Unity dependent on a clear game-control/data interface.
17. Document assumptions whenever exact hardware or protocol details are unknown.
18. Do not treat generated diagrams as authoritative hardware specifications.
19. Test each layer independently before integrating the full pipeline.
20. When changing architecture, update this document and the relevant project documentation.

---

## 14. Recommended Repository Structure

A practical structure is:

```text
project/
│
├── firmware/
│   └── esp32_imu/
│       ├── src/
│       ├── include/
│       └── README.md
│
├── server/
│   ├── api/
│   ├── ingestion/
│   ├── processing/
│   ├── features/
│   ├── assessment/
│   ├── models/
│   └── tests/
│
├── unity/
│   └── RehabGame/
│
├── data/
│   ├── raw/
│   ├── processed/
│   └── sessions/
│
├── docs/
│   ├── architecture/
│   ├── hardware/
│   └── experiments/
│
└── AGENTS.md
```

The exact framework/language structure can change according to the existing repository. Do not reorganize the entire project unnecessarily.

---

## 15. Definition of Done for the Current Prototype

The single-IMU prototype should eventually demonstrate:

```text
[✓] ICM-42688-P reads reliably
        |
[✓] ESP32 reads sensor data
        |
[✓] ESP32 connects to Wi-Fi
        |
[✓] ESP32 streams data to server
        |
[✓] Server receives and validates data
        |
[✓] Server processes sensor stream
        |
[✓] Movement features are extracted
        |
[✓] A controlled movement can be detected
        |
[✓] Result reaches Unity
        |
[✓] Unity responds to movement
        |
[✓] Basic quality/score mechanism works
        |
[✓] Game provides feedback
```

Only after this pipeline works reliably should the project expand to multiple IMUs, compensation detection, machine learning, or more advanced adaptive rehabilitation logic.

---

## 16. One-Line Project Definition

> **A single-IMU ESP32 wearable reads ICM-42688-P motion data, streams it over Wi-Fi to a server for movement analysis and quality assessment, and uses the resulting information to control an adaptive Unity 3D rehabilitation game.**
