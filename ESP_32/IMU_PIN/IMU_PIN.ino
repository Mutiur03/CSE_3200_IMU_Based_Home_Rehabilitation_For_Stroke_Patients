// Haptic bring-up: scan the I2C bus, report every device, buzz if a DRV2605L (0x5A) is found.
// Unknown devices (e.g. the 0x5F board) get a register dump 0x00-0x1F: send me that output + the chip marking.
// Ignored: 0x68/0x69 (ICM-42688-P), 0x7E (I3C broadcast, answered by some chips).
#include <Wire.h>

#define SDA_PIN 21
#define SCL_PIN 22
#define DRV_ADDRESS 0x5A  // DRV2605L is fixed here; cannot be changed

uint8_t readReg(uint8_t addr, uint8_t reg) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(true) != 0) return 0xFF;
  Wire.requestFrom((int)addr, 1);
  return Wire.available() ? Wire.read() : 0xFF;
}

void writeReg(uint8_t addr, uint8_t reg, uint8_t val) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

bool drvFound = false;

void scanBus() {
  drvFound = false;
  Serial.println("--- scan ---");
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() != 0) continue;
    if (a == 0x68 || a == 0x69) { Serial.printf("0x%02X  IMU\n", a); continue; }
    if (a == 0x7E) { Serial.println("0x7E  I3C broadcast (ignore)"); continue; }
    if (a == DRV_ADDRESS) { Serial.println("0x5A  DRV2605L haptic driver"); drvFound = true; continue; }
    Serial.printf("0x%02X  UNKNOWN device, registers 0x00-0x1F:\n   ", a);
    for (uint8_t r = 0; r < 0x20; r++) Serial.printf("%02X ", readReg(a, r));
    Serial.println();
  }
  if (!drvFound) Serial.println("No DRV2605L at 0x5A: nothing to vibrate with this code (see UNKNOWN above).");
}

void drvInit() {
  Serial.printf("DRV2605L device ID = %u (7 expected)\n", readReg(DRV_ADDRESS, 0x00) >> 5);
  writeReg(DRV_ADDRESS, 0x01, 0x00);                                          // out of standby
  writeReg(DRV_ADDRESS, 0x1A, readReg(DRV_ADDRESS, 0x1A) & 0x7F);             // ERM mode
  writeReg(DRV_ADDRESS, 0x1D, readReg(DRV_ADDRESS, 0x1D) | 0x20);             // ERM open loop
  writeReg(DRV_ADDRESS, 0x03, 1);                                             // ERM library
}

void buzz() {
  writeReg(DRV_ADDRESS, 0x04, 14);  // Strong Buzz 100%
  writeReg(DRV_ADDRESS, 0x05, 0);
  writeReg(DRV_ADDRESS, 0x0C, 1);   // GO
  Serial.println("buzz");
}

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  delay(500);
  scanBus();
  if (drvFound) drvInit();
}

void loop() {
  if (drvFound) buzz();
  else scanBus();  // keep rescanning so you can fix wiring without reflashing
  delay(5000);
}
