/*
 * sACN to DMX Bridge
 * ESP32-C6 Application
 *
 * Receives sACN (E1.31) packets over WiFi and outputs DMX512 signal
 *
 * Hardware:
 * - ESP32-C6 microcontroller
 * - GPIO 1: DMX output (to MAX485 transceiver)
 * - GPIO 8: WS2812 RGB LED for status indication
 */

#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <sACN.h>
#include <FastLED.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#include "dmx_driver.h"

// Version
#define FIRMWARE_VERSION "1.0.1"

// Pin definitions
#define DMX_TX_PIN 1
#define LED_PIN 8

// WiFi configuration
#define AP_TIMEOUT_MS 15000
#define SMARTCONFIG_TIMEOUT_MS 120000

// DMX configuration
#define DMX_PACKET_SIZE 512

// LED configuration
#define NUM_LEDS 1

// Global objects
WebServer server(80);
Preferences prefs;
WiFiUDP udp;
Receiver sacn(udp);
CRGB leds[NUM_LEDS];
DMXDriver dmx(DMX_TX_PIN);

// Configuration structure
struct Config
{
  String wifi_ssid;
  String wifi_password;
  String device_name;
  uint16_t sacn_universe;
} config;

// Runtime state
struct State
{
  bool wifi_connected;
  bool ap_mode_active;
  bool sacn_receiving;
  unsigned long sacn_packets_received;
  unsigned long sacn_packets_errors;
  unsigned long last_packet_time;
  String sacn_source_ip;
  String sacn_source_name;
  uint8_t sacn_priority;
  unsigned long uptime_start;
  unsigned long reboot_count;
  String last_reboot_reason;
  size_t min_free_heap;
  float dmx_fps;
  unsigned long dmx_frame_count;
  unsigned long dmx_fps_last_calc;
} state;

// DMX buffer
uint8_t dmx_data[DMX_PACKET_SIZE];
SemaphoreHandle_t dmx_mutex;

// Task handles
TaskHandle_t wifiTaskHandle = NULL;
TaskHandle_t sacnTaskHandle = NULL;
TaskHandle_t dmxTaskHandle = NULL;
TaskHandle_t ledTaskHandle = NULL;
TaskHandle_t serialTaskHandle = NULL;

// LED state
enum LEDState
{
  LED_OFF,
  LED_AP_MODE,
  LED_CONNECTING,
  LED_CONNECTED,
  LED_ERROR,
  LED_SMARTCONFIG,
  LED_IDENTIFY
};
volatile LEDState led_state = LED_OFF;
volatile unsigned long identify_end_time = 0;

// Forward declarations
void setupWiFi();
void setupAPI();
void loadConfig();
void saveConfig();
String getResetReason();
void wifiTask(void *parameter);
void sacnTask(void *parameter);
void dmxTask(void *parameter);
void ledTask(void *parameter);
void serialTask(void *parameter);
void onDMXFrame();

void setup()
{
  Serial.begin(115200);

  // Wait for USB-CDC serial to be ready (ESP32-C6 native USB)
  // This ensures we don't miss early boot messages
  unsigned long serial_wait_start = millis();
  while (!Serial && (millis() - serial_wait_start < 3000))
  {
    delay(10);
  }
  delay(500); // Extra delay for serial monitor to attach

  Serial.println("\n\n=================================");
  Serial.println("ThorDMX sACN to DMX Bridge");
  Serial.printf("Firmware: v%s\n", FIRMWARE_VERSION);
  Serial.println("=================================\n");

  // Initialize preferences
  prefs.begin("dmx-bridge", false);

  // Load reboot count and reason
  state.reboot_count = prefs.getULong("reboot_count", 0) + 1;
  prefs.putULong("reboot_count", state.reboot_count);
  state.last_reboot_reason = getResetReason();

  // Initialize state
  state.wifi_connected = false;
  state.sacn_receiving = false;
  state.sacn_packets_received = 0;
  state.sacn_packets_errors = 0;
  state.last_packet_time = 0;
  state.sacn_priority = 0;
  state.uptime_start = millis();
  state.min_free_heap = ESP.getFreeHeap();
  state.dmx_fps = 0;
  state.dmx_frame_count = 0;
  state.dmx_fps_last_calc = millis();

  // Load configuration
  loadConfig();

  Serial.printf("Device Name: %s\n", config.device_name.c_str());
  Serial.printf("sACN Universe: %d\n", config.sacn_universe);

  // Initialize DMX buffer
  memset(dmx_data, 0, DMX_PACKET_SIZE);
  dmx_mutex = xSemaphoreCreateMutex();

  // Initialize custom DMX driver
  if (!dmx.begin())
  {
    Serial.println("[DMX] Failed to initialize DMX driver!");
  }
  else
  {
    Serial.println("[DMX] DMX driver initialized");
  }

  // Initialize LED
  FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(50);
  leds[0] = CRGB::Black;
  FastLED.show();

  // Create tasks (ESP32-C6 is single-core, use core 0 for all)
  xTaskCreate(wifiTask, "WiFi", 4096, NULL, 1, &wifiTaskHandle);
  xTaskCreate(sacnTask, "sACN", 4096, NULL, 2, &sacnTaskHandle);
  xTaskCreate(dmxTask, "DMX", 3072, NULL, 3, &dmxTaskHandle);
  xTaskCreate(ledTask, "LED", 2048, NULL, 0, &ledTaskHandle);
  xTaskCreate(serialTask, "Serial", 3072, NULL, 1, &serialTaskHandle);

  Serial.println("Initialization complete\n");
}

void loop()
{
  // Main loop handles web server (both AP mode and station mode)
  if (state.wifi_connected || state.ap_mode_active)
  {
    server.handleClient();
  }

  // Track minimum free heap
  size_t free_heap = ESP.getFreeHeap();
  if (free_heap < state.min_free_heap)
  {
    state.min_free_heap = free_heap;
  }

  delay(10);
}

void loadConfig()
{
  config.wifi_ssid = prefs.getString("wifi_ssid", "");
  config.wifi_password = prefs.getString("wifi_pass", "");
  config.sacn_universe = prefs.getUShort("sacn_universe", 1);

  // Generate device name from MAC if not set
  String saved_name = prefs.getString("device_name", "");
  if (saved_name.length() == 0)
  {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    config.device_name = String("DMX-Bridge-") +
                         String(mac[4], HEX) + String(mac[5], HEX);
    config.device_name.toUpperCase();
  }
  else
  {
    config.device_name = saved_name;
  }
}

void saveConfig()
{
  prefs.putString("wifi_ssid", config.wifi_ssid);
  prefs.putString("wifi_pass", config.wifi_password);
  prefs.putString("device_name", config.device_name);
  prefs.putUShort("sacn_universe", config.sacn_universe);
}

String getResetReason()
{
  esp_reset_reason_t reason = esp_reset_reason();
  switch (reason)
  {
  case ESP_RST_POWERON:
    return "power_on";
  case ESP_RST_SW:
    return "software";
  case ESP_RST_PANIC:
    return "crash";
  case ESP_RST_INT_WDT:
    return "watchdog";
  case ESP_RST_TASK_WDT:
    return "watchdog";
  case ESP_RST_WDT:
    return "watchdog";
  case ESP_RST_BROWNOUT:
    return "brownout";
  default:
    return "unknown";
  }
}

String getMacAddress()
{
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(macStr);
}

String getSignalQuality(int rssi)
{
  if (rssi > -50)
    return "excellent";
  if (rssi > -60)
    return "good";
  if (rssi > -70)
    return "fair";
  return "poor";
}
