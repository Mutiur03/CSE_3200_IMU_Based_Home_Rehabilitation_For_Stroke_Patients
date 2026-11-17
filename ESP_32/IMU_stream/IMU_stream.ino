// ICM-42688-P -> ESP32 -> Wi-Fi -> WebSocket ws://SERVER_HOST:SERVER_PORT/ws/imu
// Packet schema: server/README.md. Units: accel g, gyro deg/s, timestamp device us.
//
// Two tasks so a slow Wi-Fi send never stops sampling:
//   loop() (core 1): read the IMU on its data-ready flag, group BATCH_SIZE samples, push the batch on a queue.
//   txTask (core 0): owns the WebSocket (the library is not thread-safe), pops batches and sends them.
// During a Wi-Fi stall batches wait in the queue (QUEUE_DEPTH batches = QUEUE_DEPTH * 0.1 s) and go out afterwards
// with their original device timestamps. If the queue overflows the newest batch is dropped; seq still advances,
// so the server counts it as dropped packets.
#include <Wire.h>
#include <WiFi.h>
#include <WebSocketsClient.h>  // "WebSockets" by Markus Sattler (Library Manager)
#include <HX711.h>             // "HX711" by Bogdan Necula (Library Manager)
#include "secrets.h"           // copy secrets.example.h -> secrets.h

#define DEVICE_ID   "imu_01"
#define BATCH_SIZE  10  // 100 Hz ODR / 10 = 10 frames/s
#define QUEUE_DEPTH 100  // 10 s of buffering at 100 Hz / BATCH_SIZE 10 (~25 KB heap); a ~5 s outage overflowed 40

// AD0 low -> 0x68, AD0 high -> 0x69; setup() probes both
int imuAddr = 0x69;
#define IMU_ADDRESS imuAddr

// ICM-42688-P, user bank 0
#define REG_DEVICE_CONFIG  0x11
#define REG_ACCEL_DATA_X1  0x1F  // accel X/Y/Z then gyro X/Y/Z, 12 bytes, big-endian
#define REG_INT_STATUS     0x2D  // bit3 DATA_RDY_INT, cleared on read
#define REG_PWR_MGMT0      0x4E
#define REG_GYRO_CONFIG0   0x4F
#define REG_ACCEL_CONFIG0  0x50
#define REG_INT_CONFIG1    0x64
#define REG_INT_SOURCE0    0x65
#define REG_WHO_AM_I       0x75  // expect 0x47
#define REG_BANK_SEL       0x76

// DRV2605L haptic driver + ERM motor on the same I2C bus, fixed address. The server sends {"event":"rep_done"} over
// the WebSocket when the game finishes a rep; onWsEvent (txTask) only sets repDone, loop() does the I2C buzz.
// Wire is only touched from loop() (not txTask), so no locking needed.
#define DRV_ADDRESS     0x5A
#define DRV_MODE        0x01  // 0x00 = internal trigger, exits standby
#define DRV_LIBRARY     0x03  // 1 = ERM library
#define DRV_RTP         0x02  // real-time playback amplitude (signed): 0x7F full, 0 off; used with MODE 0x05
#define DRV_FEEDBACK    0x1A  // bit7: 0 = ERM
#define DRV_CONTROL3    0x1D  // bit5: ERM open loop
#define REP_BUZZ_MS     2000  // buzz length per completed rep; library effects are <1 s, so hold the motor on with RTP

// HX711 load cell amp. NOT on 21/22 (I2C). Wire DT -> GPIO 25, SCK -> GPIO 26. Optional: no HX711 = no "load" field.
// Sent as tared raw counts (tared once at boot, keep the cell unloaded); the server scales counts to game units (LOAD_SCALE).
#define LOAD_DT  25
#define LOAD_SCK 26

// Must match server/app.py ACCEL_LIMIT_G / GYRO_LIMIT_DPS
#define ACCEL_LSB_PER_G   2048.0  // +-16 g
#define GYRO_LSB_PER_DPS  16.4    // +-2000 dps

struct Sample { int64_t t; int16_t raw[6]; };
struct Batch { uint32_t seq; Sample s[BATCH_SIZE]; bool hasLoad; float load; };

WebSocketsClient ws;  // touched only by txTask after setup()
QueueHandle_t txQueue;
Batch cur;  // batch being filled by loop()
int n = 0;
uint32_t seq = 0;
int64_t lastDataUs = 0;
volatile uint32_t droppedBatches = 0;
HX711 scale;
bool loadFound = false;
bool loadValid = false;  // at least one reading since boot
float loadCounts = 0;    // latest tared reading, only touched by loop()
volatile bool repDone = false;  // set by onWsEvent on txTask, consumed by loop()

void writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(IMU_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

uint8_t readRegister(uint8_t reg) {
  Wire.beginTransmission(IMU_ADDRESS);
  Wire.write(reg);
  Wire.endTransmission(true);  // STOP, not repeated start: flaky on ESP32 with Wi-Fi active
  Wire.requestFrom(IMU_ADDRESS, 1);
  return Wire.available() ? Wire.read() : 0xFF;
}

uint8_t lastI2cErr = 0;  // 0 ok, 2 addr NACK, 3 data NACK, 4 other, 5 timeout
void drvWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(DRV_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

uint8_t drvRead(uint8_t reg) {
  Wire.beginTransmission(DRV_ADDRESS);
  Wire.write(reg);
  Wire.endTransmission(true);
  Wire.requestFrom(DRV_ADDRESS, 1);
  return Wire.available() ? Wire.read() : 0xFF;
}

bool readImu(int16_t *raw) {
  Wire.beginTransmission(IMU_ADDRESS);
  Wire.write(REG_ACCEL_DATA_X1);
  lastI2cErr = Wire.endTransmission(true);  // STOP, not repeated start
  if (lastI2cErr) return false;
  if (Wire.requestFrom(IMU_ADDRESS, 12) != 12) { lastI2cErr = 99; return false; }  // 99 = short read
  for (int i = 0; i < 6; i++) raw[i] = (Wire.read() << 8) | Wire.read();
  return true;
}

void onWsEvent(WStype_t type, uint8_t *payload, size_t len) {
  if (type == WStype_CONNECTED) Serial.println("Server connected");
  else if (type == WStype_DISCONNECTED) Serial.println("Server disconnected, retrying");
  else if (type == WStype_TEXT) {
    Serial.printf("Server: %.*s\n", (int)len, (char *)payload);  // rep_done cue or validation errors
    if (len >= 8 && memmem(payload, len, "rep_done", 8)) repDone = true;
  }
}

void sendBatch(const Batch &b) {
  // ~140 chars/sample worst case + header; 2048 covers BATCH_SIZE <= 13
  static char buf[2048];
  int len = snprintf(buf, sizeof(buf), "{\"device_id\":\"%s\",\"seq\":%u,\"samples\":[", DEVICE_ID, b.seq);
  for (int i = 0; i < BATCH_SIZE; i++) {
    const int16_t *r = b.s[i].raw;
    len += snprintf(buf + len, sizeof(buf) - len,
                    "%s{\"timestamp\":%lld,\"accel\":{\"x\":%.4f,\"y\":%.4f,\"z\":%.4f},"
                    "\"gyro\":{\"x\":%.3f,\"y\":%.3f,\"z\":%.3f}}",
                    i ? "," : "", (long long)b.s[i].t,
                    r[0] / ACCEL_LSB_PER_G, r[1] / ACCEL_LSB_PER_G, r[2] / ACCEL_LSB_PER_G,
                    r[3] / GYRO_LSB_PER_DPS, r[4] / GYRO_LSB_PER_DPS, r[5] / GYRO_LSB_PER_DPS);
  }
  len += snprintf(buf + len, sizeof(buf) - len, "]");
  if (b.hasLoad) len += snprintf(buf + len, sizeof(buf) - len, ",\"load\":%.1f", b.load);
  len += snprintf(buf + len, sizeof(buf) - len, "}");
  if (len < (int)sizeof(buf)) ws.sendTXT(buf, len);
}

void txTask(void *) {
  ws.begin(SERVER_HOST, SERVER_PORT, "/ws/imu");
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(2000);
  ws.enableHeartbeat(15000, 3000, 2);  // detect dead connection, then reconnect

  static Batch b;
  uint32_t reported = 0;
  for (;;) {
    ws.loop();
    if (droppedBatches != reported) {
      reported = droppedBatches;
      Serial.printf("tx queue full: %u batches dropped so far\n", (unsigned)reported);
    }
    if (!ws.isConnected()) {
      vTaskDelay(pdMS_TO_TICKS(5));  // batches keep queuing meanwhile
      continue;
    }
    if (xQueueReceive(txQueue, &b, pdMS_TO_TICKS(5)) == pdTRUE) sendBatch(b);
  }
}

void setup() {
  Serial.begin(115200);

  // Do NOT call pinMode() on 21/22 after this; it detaches them from I2C
  Wire.begin(21, 22);
  Wire.setClock(100000);  // 100 kHz: more tolerant of long/loose wires and Wi-Fi noise; raise to 400000 once stable

  bool found = false;
  for (int a = 0x68; a <= 0x69 && !found; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { imuAddr = a; found = true; }
  }
  Serial.printf("IMU %s at 0x%02X\n", found ? "found" : "NOT FOUND (check wiring/power), defaulting", imuAddr);

  writeRegister(REG_BANK_SEL, 0x00);
  writeRegister(REG_DEVICE_CONFIG, 0x01);  // soft reset
  delay(10);

  uint8_t who = readRegister(REG_WHO_AM_I);
  Serial.printf("WHO_AM_I = 0x%02X (expect 0x47)\n", who);
  if (who != 0x47) Serial.println("Wrong chip/address or wiring. Check before trusting data.");

  writeRegister(REG_INT_CONFIG1, 0x00);    // clear INT_ASYNC_RESET (datasheet requirement)
  writeRegister(REG_INT_SOURCE0, 0x08);    // data-ready -> INT1 (also drives INT_STATUS polling)
  writeRegister(REG_GYRO_CONFIG0, 0x08);   // +-2000 dps, 100 Hz
  writeRegister(REG_ACCEL_CONFIG0, 0x08);  // +-16 g, 100 Hz
  writeRegister(REG_PWR_MGMT0, 0x0F);      // gyro + accel low-noise mode
  delay(50);                               // gyro needs >=45 ms to start

  Wire.beginTransmission(DRV_ADDRESS);
  bool drvFound = Wire.endTransmission() == 0;
  Serial.println(drvFound ? "DRV2605L found at 0x5A" : "DRV2605L NOT FOUND at 0x5A (check VIN/GND/SDA/SCL)");
  drvWrite(DRV_MODE, 0x00);                                    // out of standby
  drvWrite(DRV_FEEDBACK, drvRead(DRV_FEEDBACK) & 0x7F);        // ERM mode
  drvWrite(DRV_CONTROL3, drvRead(DRV_CONTROL3) | 0x20);        // open loop: no auto-calibration needed
  drvWrite(DRV_LIBRARY, 1);

  scale.begin(LOAD_DT, LOAD_SCK);
  loadFound = scale.wait_ready_timeout(1000);
  Serial.println(loadFound ? "HX711 found, taring (keep load cell unloaded)..." : "HX711 not found, streaming IMU only");
  if (loadFound) scale.tare(10);  // ~1 s at 10 SPS

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // modem power-save can stall traffic for 100s of ms to seconds; we stream continuously
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Connecting to %s", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) { delay(250); Serial.print("."); }
  Serial.printf("\nWi-Fi OK, IP %s\n", WiFi.localIP().toString().c_str());

  txQueue = xQueueCreate(QUEUE_DEPTH, sizeof(Batch));
  xTaskCreatePinnedToCore(txTask, "tx", 8192, nullptr, 1, nullptr, 0);  // core 0 with the Wi-Fi stack; loop() runs on core 1
  lastDataUs = esp_timer_get_time();
}

void loop() {
  static uint32_t buzzStartMs = 0;
  static bool buzzing = false;
  if (repDone) {  // non-blocking: 2 short I2C writes to start, 2 to stop. A new rep during a buzz restarts the 2 s.
    repDone = false;
    buzzStartMs = millis();
    if (!buzzing) {
      drvWrite(DRV_MODE, 0x05);  // RTP mode
      drvWrite(DRV_RTP, 0x7F);   // full amplitude
      buzzing = true;
    }
  } else if (buzzing && millis() - buzzStartMs >= REP_BUZZ_MS) {
    drvWrite(DRV_RTP, 0x00);
    drvWrite(DRV_MODE, 0x00);  // back to internal trigger
    buzzing = false;
  }
  // HX711 runs at 10 SPS; read only when it has a sample (read() would otherwise block up to 100 ms and skip IMU samples).
  if (loadFound && scale.is_ready()) {
    loadCounts = scale.get_value(1);
    loadValid = true;
  }
  // Sample on the sensor's own data-ready flag: no duplicate or skipped readings vs ODR.
  // Never blocks on the network, so a Wi-Fi stall cannot skip samples (see header comment).
  if (!(readRegister(REG_INT_STATUS) & 0x08)) {
    if (esp_timer_get_time() - lastDataUs > 100000) {
      Serial.println("No IMU data-ready for 100 ms");
      lastDataUs = esp_timer_get_time();
    }
    return;
  }
  int64_t t = esp_timer_get_time();
  lastDataUs = t;
  if (!readImu(cur.s[n].raw)) {
    static uint32_t fails = 0;
    if (++fails % 100 == 1) Serial.printf("I2C read failed (#%u, addr 0x%02X, err %u, WiFi %s)\n", (unsigned)fails, imuAddr, lastI2cErr,WiFi.status() == WL_CONNECTED ? "up" : "down");
    Wire.end();  // reset a possibly stuck bus
    Wire.begin(21, 22);
    Wire.setClock(100000);
    delay(10);
    return;
  }
  cur.s[n++].t = t;
  if (n == BATCH_SIZE) {
    cur.hasLoad = loadValid;
    cur.load = loadCounts;
    cur.seq = seq++;  // advances even if the queue is full: server counts the gap as dropped packets
    if (xQueueSend(txQueue, &cur, 0) != pdTRUE) droppedBatches++;
    n = 0;
  }
}
