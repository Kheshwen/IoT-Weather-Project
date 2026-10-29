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

// Seri Iskandar Coordinates (4.3597° N, 100.9782° E)
const char* apiUrl = "https://api.open-meteo.com/v1/forecast?latitude=4.3597&longitude=100.9782&hourly=precipitation_probability,precipitation&current=temperature_2m,relative_humidity_2m,precipitation&timezone=Asia%2FKuala_Lumpur&forecast_hours=6";

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

// Open-Meteo Cloud Metrics
int   upcomingRainProb = 0;
float cloudPrecip = 0.0;
bool  apiSuccess = false;

// Connectivity & State Control
bool isOnline = false;
unsigned long lastWifiRetry = 0;
const unsigned long WIFI_RETRY_INTERVAL = 30000; // Retry Wi-Fi every 30s when offline

unsigned long lastApiFetch = 0;
const unsigned long API_INTERVAL = 10 * 60 * 1000; // Poll Open-Meteo every 10 minutes

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

void fetchOpenMeteoForecast() {
  if (WiFi.status() != WL_CONNECTED) {
    isOnline = false;
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Bypass TLS root certificate verification
  HTTPClient http;

  if (http.begin(client, apiUrl)) {
    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK) {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, http.getString());
      if (!err) {
        upcomingRainProb = doc["hourly"]["precipitation_probability"][1] | 0;
        cloudPrecip      = doc["current"]["precipitation"] | 0.0;
        apiSuccess = true;
      }
    }
    http.end();
  }
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
  } else if ((isOnline && (upcomingRainProb >= 60 || cloudPrecip > 0.5)) || (!isOnline && localRainPercent > 15)) {
    // Yellow Alert: Rain imminent (Open-Meteo prediction >= 60% OR slight moisture detected offline)
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
  } else if (isOnline && upcomingRainProb >= 60) {
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
    // PAGE 1: Open-Meteo Forecast (Only shown when Online)
    display.setCursor(0, 14);
    display.print(F("[OPEN-METEO 4.36N]"));

    display.setCursor(0, 26);
    display.printf("Rain Prob: %d %%", upcomingRainProb);

    display.setCursor(0, 38);
    display.printf("Precip: %.1f mm", cloudPrecip);

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
    fetchOpenMeteoForecast();
    lastApiFetch = millis();
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
      // Periodic Open-Meteo API fetch
      if (currentMillis - lastApiFetch >= API_INTERVAL) {
        lastApiFetch = currentMillis;
        fetchOpenMeteoForecast();
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
        fetchOpenMeteoForecast();
        lastApiFetch = currentMillis;
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
