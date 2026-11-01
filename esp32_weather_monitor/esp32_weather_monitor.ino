#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>

// Wi-Fi Configuration
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Weather server (Vercel). The server reads Open-Meteo, the ESP32 only posts its own readings.
const char* ingestUrl   = "https://iot-weather-phi.vercel.app/api/ingest";
const char* deviceToken = "PASTE_DEVICE_TOKEN";

// Hardware Pin Definitions
#define I2C_SDA     22
#define I2C_SCL     23

#define RED_PIN     25
#define YELLOW_PIN  26
#define GREEN_PIN   27
#define BUZZER_PIN  18

#define RAIN_PIN    34

// OLED Configuration (128x64)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Sensor Objects
Adafruit_BME280 bme;

// Local Hardware Metrics
float localTemp = 0.0;
float localHumidity = 0.0;
float localPressure = 0.0;
int   localRainPercent = 0;
bool  bmeFound = false;

// Server reply: rain chance for the next full hour, and the 60% flag
int   upcomingRainProb = 0;
bool  rainFlag = false;
bool  apiSuccess = false;

// Connectivity & State Control
bool isOnline = false;
unsigned long lastWifiRetry = 0;
const unsigned long WIFI_RETRY_INTERVAL = 30000; // Retry Wi-Fi every 30s when offline

unsigned long lastPost = 0;
const unsigned long POST_INTERVAL = 5UL * 60 * 1000; // Post a reading every 5 minutes

unsigned long lastSensorPoll = 0;
const unsigned long SENSOR_INTERVAL = 1000; // Read sensors & evaluate alerts every 1s

unsigned long lastDisplaySwitch = 0;
const unsigned long SCREEN_SWITCH_INTERVAL = 4000; // Alternate screens every 4s if online
int displayPage = 0;

void setLEDs(bool red, bool yellow, bool green) {
  digitalWrite(RED_PIN, red ? HIGH : LOW);
  digitalWrite(YELLOW_PIN, yellow ? HIGH : LOW);
  digitalWrite(GREEN_PIN, green ? HIGH : LOW);
}

// Send the latest sensor reading to the server and read the rain flag from the reply.
void postReading() {
  if (WiFi.status() != WL_CONNECTED) {
    isOnline = false;
    return;
  }
  // Never post a reading the BME280 did not produce.
  if (!bmeFound || isnan(localTemp) || isnan(localHumidity) || isnan(localPressure)) return;

  WiFiClientSecure client;
  client.setInsecure(); // Bypass TLS root certificate verification
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(client, ingestUrl)) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", deviceToken);

  JsonDocument body;
  body["temperature_c"] = localTemp;
  body["humidity_pct"]  = localHumidity;
  body["pressure_hpa"]  = localPressure;
  body["rain_pct"]      = localRainPercent;
  body["is_wet"]        = localRainPercent > 35; // same threshold as the red alert
  String payload;
  serializeJson(body, payload);

  int httpCode = http.POST(payload);
  if (httpCode == HTTP_CODE_OK) {
    JsonDocument reply;
    if (!deserializeJson(reply, http.getString())) {
      rainFlag         = reply["rain_flag"] | false;
      upcomingRainProb = reply["precip_prob_pct"] | 0;
      apiSuccess = true;
    }
  } else {
    Serial.printf("POST failed, HTTP %d\n", httpCode);
  }
  http.end();
}

void readLocalSensors() {
  if (bmeFound) {
    localTemp     = bme.readTemperature();
    localHumidity = bme.readHumidity();
    localPressure = bme.readPressure() / 100.0F; // Pa to hPa
  }

  // Rain Plate Analog reading (4095 = dry, 1000 = saturated)
  int rawADC = analogRead(RAIN_PIN);
  localRainPercent = map(constrain(rawADC, 1000, 4095), 4095, 1000, 0, 100);
}

void updateAlertSystem() {
  if (localRainPercent > 35) {
    // Red Alert: Water droplets detected directly on hardware sensor plate
    setLEDs(true, false, false);
    tone(BUZZER_PIN, 1200, 80);
  } else if ((isOnline && rainFlag) || (!isOnline && localRainPercent > 15)) {
    // Yellow Alert: Rain imminent (server flag, rain chance >= 60% OR slight moisture detected offline)
    setLEDs(false, true, false);
    tone(BUZZER_PIN, 700, 30);
  } else {
    // Green: Normal conditions
    setLEDs(false, false, true);
    noTone(BUZZER_PIN);
  }
}

void renderScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // Top Status Bar
  display.setCursor(0, 0);
  if (localRainPercent > 35) {
    display.print(F("ALERT: RAIN DETECTED"));
  } else if (isOnline && rainFlag) {
    display.print(F("WARN: RAIN IMMINENT"));
  } else {
    display.print(isOnline ? F("NODE: ONLINE [WiFi]") : F("NODE: OFFLINE [LOCAL]"));
  }
  display.drawLine(0, 10, SCREEN_WIDTH, 10, SSD1306_WHITE);

  // Determine what to display:
  // If offline, ALWAYS stay on Local Sensor View (Page 0)
  if (!isOnline || displayPage == 0) {
    // PAGE 0: Local Observation (BME280 + Rain Sensor)
    display.setCursor(0, 14);
    display.print(F("[LOCAL METRICS]"));

    display.setCursor(0, 26);
    display.printf("Temp: %.1f C", localTemp);

    display.setCursor(0, 37);
    display.printf("Humid: %.0f %%", localHumidity);

    display.setCursor(0, 48);
    display.printf("Press: %.0f hPa", localPressure);

    display.setCursor(0, 56);
    display.printf("Plate: %d%%", localRainPercent);

    // Visual gauge bar for physical moisture
    display.drawRect(70, 56, 56, 7, SSD1306_WHITE);
    int barFill = map(localRainPercent, 0, 100, 0, 52);
    display.fillRect(72, 58, barFill, 3, SSD1306_WHITE);

  } else {
    // PAGE 1: Forecast from the server (Only shown when Online)
    display.setCursor(0, 14);
    display.print(F("[FORECAST 4.36N]"));

    display.setCursor(0, 26);
    display.printf("Rain Prob: %d %%", upcomingRainProb);

    display.setCursor(0, 38);
    display.printf("Rain flag: %s", rainFlag ? "YES" : "NO");

    display.setCursor(0, 50);
    display.print(F("Forecast Horizon: +1h"));
  }

  display.display();
}

void setup() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(YELLOW_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RAIN_PIN, INPUT);

  Serial.begin(115200);

  // Start I2C bus on GPIO 22 (SDA) and GPIO 23 (SCL)
  Wire.begin(I2C_SDA, I2C_SCL);

  // Initialize OLED (Check 0x3C first, then 0x3D)
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(F("Connecting WiFi..."));
  display.setCursor(0, 32);
  display.println(F("(Timeout: 6 sec)"));
  display.display();

  // Initialize BME280 (Address 0x76 or 0x77)
  if (bme.begin(0x76, &Wire) || bme.begin(0x77, &Wire)) {
    bmeFound = true;
    Serial.println(F("BME280 found."));
  } else {
    Serial.println(F("BME280 not detected on D22/D23."));
  }

  // Attempt Wi-Fi Connection (Bounded to 6 seconds)
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  unsigned long startWifi = millis();

  while (WiFi.status() != WL_CONNECTED && (millis() - startWifi < 6000)) {
    delay(300);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    isOnline = true;
    Serial.println(F("\nWiFi Connected!"));
    readLocalSensors(); // first post must carry real values
    postReading();
    lastPost = millis();
  } else {
    isOnline = false;
    Serial.println(F("\nWiFi Failed / Timed out. Starting in Local Mode."));
    // Short audible notification that node started offline
    tone(BUZZER_PIN, 440, 200);
  }

  // Initial sensor read and screen render
  readLocalSensors();
  renderScreen();
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Connection Monitoring & Background Reconnect
  if (isOnline) {
    if (WiFi.status() != WL_CONNECTED) {
      isOnline = false;
      Serial.println(F("WiFi connection lost. Switched to Local Mode."));
    } else {
      // Periodic reading post
      if (currentMillis - lastPost >= POST_INTERVAL) {
        lastPost = currentMillis;
        postReading();
      }
    }
  } else {
    // Offline Mode: Attempt silent reconnect every 30 seconds
    if (currentMillis - lastWifiRetry >= WIFI_RETRY_INTERVAL) {
      lastWifiRetry = currentMillis;
      Serial.println(F("Attempting background WiFi reconnect..."));
      if (WiFi.status() == WL_CONNECTED || WiFi.reconnect()) {
        isOnline = true;
        Serial.println(F("WiFi re-established!"));
        postReading();
        lastPost = currentMillis;
      }
    }
  }

  // 2. Poll Physical Sensors & Evaluate Alerts (Every 1s)
  if (currentMillis - lastSensorPoll >= SENSOR_INTERVAL) {
    lastSensorPoll = currentMillis;
    readLocalSensors();
    updateAlertSystem();
  }

  // 3. Screen Update Controller
  if (isOnline) {
    // Online: Cycle between Local (Page 0) and Forecast (Page 1)
    if (currentMillis - lastDisplaySwitch >= SCREEN_SWITCH_INTERVAL) {
      lastDisplaySwitch = currentMillis;
      displayPage = (displayPage == 0) ? 1 : 0;
      renderScreen();
    }
  } else {
    // Offline: Lock to Local view and refresh every 1s
    if (currentMillis - lastDisplaySwitch >= 1000) {
      lastDisplaySwitch = currentMillis;
      displayPage = 0;
      renderScreen();
    }
  }
}
