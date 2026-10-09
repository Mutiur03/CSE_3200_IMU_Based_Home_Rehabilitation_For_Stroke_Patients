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
#include "secrets.h"           // copy secrets.example.h -> secrets.h

#define DEVICE_ID   "imu_01"
#define BATCH_SIZE  10  // 100 Hz ODR / 10 = 10 frames/s
#define QUEUE_DEPTH 100  // 10 s of buffering at 100 Hz / BATCH_SIZE 10 (~25 KB heap); a ~5 s outage overflowed 40

// AD0 high -> 0x69, AD0 low -> 0x68
#define IMU_ADDRESS 0x69

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

// Must match server/app.py ACCEL_LIMIT_G / GYRO_LIMIT_DPS
#define ACCEL_LSB_PER_G   2048.0  // +-16 g
#define GYRO_LSB_PER_DPS  16.4    // +-2000 dps

struct Sample { int64_t t; int16_t raw[6]; };
struct Batch { uint32_t seq; Sample s[BATCH_SIZE]; };

WebSocketsClient ws;  // touched only by txTask after setup()
QueueHandle_t txQueue;
Batch cur;  // batch being filled by loop()
int n = 0;
uint32_t seq = 0;
int64_t lastDataUs = 0;
volatile uint32_t droppedBatches = 0;

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

bool readImu(int16_t *raw) {
  Wire.beginTransmission(IMU_ADDRESS);
  Wire.write(REG_ACCEL_DATA_X1);
  Wire.endTransmission(false);
  if (Wire.requestFrom(IMU_ADDRESS, 12) != 12) return false;
  for (int i = 0; i < 6; i++) raw[i] = (Wire.read() << 8) | Wire.read();
  return true;
}

void onWsEvent(WStype_t type, uint8_t *payload, size_t len) {
  if (type == WStype_CONNECTED) Serial.println("Server connected");
  else if (type == WStype_DISCONNECTED) Serial.println("Server disconnected, retrying");
  else if (type == WStype_TEXT) Serial.printf("Server: %.*s\n", (int)len, (char *)payload);  // validation errors
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
  len += snprintf(buf + len, sizeof(buf) - len, "]}");
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
  Wire.setClock(400000);

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
  if (!readImu(cur.s[n].raw)) { Serial.println("I2C read failed"); return; }
  cur.s[n++].t = t;
  if (n == BATCH_SIZE) {
    cur.seq = seq++;  // advances even if the queue is full: server counts the gap as dropped packets
    if (xQueueSend(txQueue, &cur, 0) != pdTRUE) droppedBatches++;
    n = 0;
  }
}
