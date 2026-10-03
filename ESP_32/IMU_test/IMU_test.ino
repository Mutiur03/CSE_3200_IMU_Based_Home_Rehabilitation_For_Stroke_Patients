#include <Wire.h>

// AD0 high -> 0x69, AD0 low -> 0x68
#define IMU_ADDRESS 0x69

// ICM-42688-P, user bank 0
#define REG_DEVICE_CONFIG  0x11
#define REG_ACCEL_DATA_X1  0x1F  // accel X/Y/Z then gyro X/Y/Z, 12 bytes, big-endian
#define REG_PWR_MGMT0      0x4E
#define REG_GYRO_CONFIG0   0x4F
#define REG_ACCEL_CONFIG0  0x50
#define REG_WHO_AM_I       0x75  // expect 0x47
#define REG_BANK_SEL       0x76

void writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(IMU_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

uint8_t readRegister(uint8_t reg) {
  Wire.beginTransmission(IMU_ADDRESS);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(IMU_ADDRESS, 1);
  return Wire.available() ? Wire.read() : 0xFF;
}

void setup() {
  Serial.begin(115200);
  while (!Serial);

  // Do NOT call pinMode() on 21/22 after this; it detaches them from I2C
  Wire.begin(21, 22);
  Wire.setClock(400000);

  writeRegister(REG_BANK_SEL, 0x00);
  writeRegister(REG_DEVICE_CONFIG, 0x01);  // soft reset
  delay(10);

  uint8_t who = readRegister(REG_WHO_AM_I);
  Serial.printf("WHO_AM_I = 0x%02X (expect 0x47)\n", who);
  if (who != 0x47) Serial.println("Wrong chip/address or wiring. Check before trusting data.");

  writeRegister(REG_GYRO_CONFIG0, 0x08);   // +-2000 dps, 100 Hz
  writeRegister(REG_ACCEL_CONFIG0, 0x08);  // +-16 g, 100 Hz
  writeRegister(REG_PWR_MGMT0, 0x0F);      // gyro + accel low-noise mode
  delay(50);                               // gyro needs >=45 ms to start
}

void loop() {
  Wire.beginTransmission(IMU_ADDRESS);
  Wire.write(REG_ACCEL_DATA_X1);
  Wire.endTransmission(false);
  if (Wire.requestFrom(IMU_ADDRESS, 12) != 12) {
    Serial.println("I2C read failed");
    delay(100);
    return;
  }

  int16_t raw[6];
  for (int i = 0; i < 6; i++) raw[i] = (Wire.read() << 8) | Wire.read();

  Serial.printf("Accel XYZ: [%.2f, %.2f, %.2f] g  ||  Gyro XYZ: [%.2f, %.2f, %.2f] dps\n",
                raw[0] / 2048.0, raw[1] / 2048.0, raw[2] / 2048.0,
                raw[3] / 16.4, raw[4] / 16.4, raw[5] / 16.4);

  delay(40);
}
