// HX711 load cell bench test. Same wiring and same numbers as IMU_stream.ino:
// reads TARED RAW COUNTS (what the stream firmware sends as "load"), so the printed LOAD_SCALE
// can be pasted straight into the server env (LOAD_SCALE = counts per kg, see server/README.md).
#include "HX711.h"

#define DT  25
#define SCK 26
#define G   9.80665f  // N per kg

// Counts per kg. 0 = not calibrated yet: hang a known weight, type its kg in the Serial Monitor.
#define CAL_FACTOR 0.0f

HX711 scale;  // left at scale 1.0 / offset = tare: get_value() returns raw tared counts, like the stream firmware
float calFactor = CAL_FACTOR;

void tare(int n) {
  Serial.println("Taring - keep the load cell unloaded...");
  scale.tare(n);
  Serial.println("Tare done.");
}

void setup() {
  Serial.begin(115200);
  Serial.println("Load Cell Testing...");
  scale.begin(DT, SCK);

  if (!scale.wait_ready_timeout(1000)) {
    Serial.println("HX711 NOT detected. Check VCC 3.3V, GND, DT->GPIO25, SCK->GPIO26. Retrying in loop().");
  } else {
    Serial.println("HX711 detected.");
    delay(2000);  // let it settle
    tare(20);
  }
  Serial.println("Type a known weight in kg + Enter to calibrate (e.g. 0.5). 't' + Enter = re-tare.");
}

void loop() {
  if (Serial.available()) {
    if (Serial.peek() == 't') {
      Serial.read();
      if (scale.wait_ready_timeout(1000)) tare(10);
      else Serial.println("HX711 not ready, cannot tare.");
    } else {
      float kg = Serial.parseFloat();
      if (kg > 0.0f && scale.wait_ready_timeout(1000)) {
        float counts = scale.get_value(10);  // tared counts under the known weight
        calFactor = counts / kg;
        Serial.printf("LOAD_SCALE = %.1f  <- set as env LOAD_SCALE on the server (negative value is fine if force reads negative)\n", calFactor);
      }
    }
    while (Serial.available()) Serial.read();  // drop leftover newline
  }

  if (!scale.wait_ready_timeout(500)) {  // never block forever if the amp is unplugged
    Serial.println("HX711 not ready (check wiring)");
    return;
  }
  float counts = scale.get_value(1);  // ~10 samples/s
  if (calFactor != 0.0f) {
    float kg = counts / calFactor;
    Serial.printf("raw %.0f  |  %.3f kg  %.2f N\n", counts, kg, kg * G);
  } else {
    Serial.printf("raw %.0f  (not calibrated: type known kg + Enter)\n", counts);
  }
}
