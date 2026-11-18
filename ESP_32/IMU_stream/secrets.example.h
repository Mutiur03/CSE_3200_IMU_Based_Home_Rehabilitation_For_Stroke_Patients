// Copy to secrets.h (git-ignored) and fill in.
#define WIFI_SSID   "your-wifi"
#define WIFI_PASS   "your-password"
#define SERVER_HOST "192.168.1.100"  // PC running uvicorn (ipconfig -> IPv4 Address)
#define SERVER_PORT 8000
#define DEVICE_KEY  "paste-device-key-here"  // issued once by the admin portal; sent as X-Device-Key. Ignored by a lab-mode server (no DB)
#define SERVER_USE_TLS 0  // 1 = wss for a cloud deployment (also set SERVER_PORT 443). Certificate is NOT verified: LAN demo only, add a CA/fingerprint for real use
