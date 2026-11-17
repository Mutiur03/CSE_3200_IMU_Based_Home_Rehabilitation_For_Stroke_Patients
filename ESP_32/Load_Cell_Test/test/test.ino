
#include "HX711.h"

#define DT 25
#define SCK 26

// Counts per kg. 0 = calibrate at boot with a known weight (serial), then paste the printed value here.
#define CAL_FACTOR 0.0f
#define G 9.80665f // N per kg

HX711 scale;
bool calibrated = CAL_FACTOR != 0.0f;

void setup()
{
    Serial.begin(115200);

    scale.begin(DT, SCK);

    Serial.println("Load Cell Testing...");

    if (scale.is_ready())
    {
        Serial.println("HX711 detected successfully!");
    }
    else
    {
        Serial.println("HX711 not detected!");
    }

    Serial.println("Taring - keep load cell unloaded...");
    delay(2000); // let it settle
    scale.wait_ready();
    scale.tare(20); // avg 20 samples as zero offset
    Serial.println("Tare done.");

    if (CAL_FACTOR != 0.0f)
        scale.set_scale(CAL_FACTOR);
    Serial.println("Live readings below. Put a known weight on, type its kg (e.g. 0.5) + Enter to calibrate. 't' + Enter = re-tare.");
}

void loop()
{
    if (Serial.available())
    {
        if (Serial.peek() == 't')
        {
            Serial.read();
            scale.tare(10);
            Serial.println("Re-tared.");
        }
        else
        {
            float kg = Serial.parseFloat();
            if (kg > 0.0f)
            {
                float raw = scale.get_value(10); // tared counts under the known weight
                scale.set_scale(raw / kg);
                calibrated = true;
                Serial.printf("CAL_FACTOR = %.1f  <- paste into #define CAL_FACTOR\n", raw / kg);
            }
        }
        while (Serial.available()) Serial.read(); // drop leftover newline
    }

    scale.wait_ready(); // ~10 samples/s
    float v = scale.get_units(1); // kg once calibrated, else raw counts
    if (calibrated)
        Serial.printf("%.3f kg  %.2f N\n", v, v * G);
    else
        Serial.printf("raw %.0f  (not calibrated: type known kg + Enter)\n", v);
}
