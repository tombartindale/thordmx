/*
 * WiFi Management Task
 * Handles AP mode, station mode, SmartConfig, and reconnection logic
 */

void wifiTask(void* parameter) {
  bool ap_mode = false;
  unsigned long connect_start = 0;
  unsigned long smartconfig_start = 0;
  bool smartconfig_active = false;

  while (true) {
    // Check if we have WiFi credentials
    if (config.wifi_ssid.length() == 0) {
      // No credentials, enter AP mode
      if (!ap_mode) {
        Serial.println("[WiFi] No credentials found, entering AP mode");
        startAPMode();
        ap_mode = true;
        led_state = LED_AP_MODE;
        // smartconfig_active = true;
        smartconfig_start = millis();
      }

      // Listen for SmartConfig while in AP mode
      if (smartconfig_active) {
        if (WiFi.smartConfigDone()) {
          Serial.println("[WiFi] SmartConfig: credentials received!");

          // Flash LED green twice
          for (int i = 0; i < 2; i++) {
            leds[0] = CRGB::Green;
            FastLED.show();
            delay(100);
            leds[0] = CRGB::Black;
            FastLED.show();
            delay(100);
          }

          // Save credentials
          config.wifi_ssid = WiFi.SSID();
          config.wifi_password = WiFi.psk();
          saveConfig();

          Serial.println("[WiFi] SmartConfig credentials saved, rebooting...");
          delay(1000);
          ESP.restart();
        }

        // Check SmartConfig timeout
        if (millis() - smartconfig_start > SMARTCONFIG_TIMEOUT_MS) {
          Serial.println("[WiFi] SmartConfig timeout, restarting listener");
          smartconfig_start = millis();
          WiFi.beginSmartConfig();
        }
      }
    } else {
      // Have credentials, try to connect
      if (!state.wifi_connected) {
        if (connect_start == 0) {
          // Start connection attempt
          Serial.printf("[WiFi] Connecting to: %s\n", config.wifi_ssid.c_str());
          WiFi.mode(WIFI_STA);
          WiFi.begin(config.wifi_ssid.c_str(), config.wifi_password.c_str());
          WiFi.setHostname(config.device_name.c_str());
          connect_start = millis();
          led_state = LED_CONNECTING;
        }

        // Check connection status
        if (WiFi.status() == WL_CONNECTED) {
          state.wifi_connected = true;
          Serial.println("[WiFi] Connected!");
          Serial.printf("  IP: %s\n", WiFi.localIP().toString().c_str());
          Serial.printf("  RSSI: %d dBm\n", WiFi.RSSI());

          // Start services
          setupAPI();
          startMDNS();

          // sACN will be initialized by sacnTask
          led_state = LED_CONNECTED;
          connect_start = 0;
          ap_mode = false;
        } else if (millis() - connect_start > AP_TIMEOUT_MS) {
          // Connection timeout, fall back to AP mode
          Serial.println("[WiFi] Connection timeout, entering AP mode");
          WiFi.disconnect();
          startAPMode();
          ap_mode = true;
          led_state = LED_AP_MODE;
          connect_start = 0;

          // Start SmartConfig
          smartconfig_active = true;
          smartconfig_start = millis();
          WiFi.beginSmartConfig();
        }
      } else {
        // Connected, monitor connection
        if (WiFi.status() != WL_CONNECTED) {
          Serial.println("[WiFi] Connection lost!");
          state.wifi_connected = false;
          led_state = LED_ERROR;
          connect_start = 0;
          MDNS.end();
          server.stop();
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(500));
  }
}

void startAPMode() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  String ap_ssid = String("DMX-Bridge-") +
                   String(mac[4], HEX) + String(mac[5], HEX);
  ap_ssid.toUpperCase();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(ap_ssid.c_str());

  Serial.printf("[WiFi] AP Mode started: %s\n", ap_ssid.c_str());
  Serial.printf("  IP: %s\n", WiFi.softAPIP().toString().c_str());

  // Start captive portal
  setupAPI();
}

void startMDNS() {
  if (MDNS.begin(config.device_name.c_str())) {
    Serial.printf("[mDNS] Started: %s.local\n", config.device_name.c_str());

    // Advertise service
    MDNS.addService("_sacn-dmx", "_tcp", 80);
    MDNS.addServiceTxt("_sacn-dmx", "_tcp", "universe", String(config.sacn_universe));
    MDNS.addServiceTxt("_sacn-dmx", "_tcp", "mac", getMacAddress());
    MDNS.addServiceTxt("_sacn-dmx", "_tcp", "version", FIRMWARE_VERSION);
  } else {
    Serial.println("[mDNS] Failed to start");
  }
}
