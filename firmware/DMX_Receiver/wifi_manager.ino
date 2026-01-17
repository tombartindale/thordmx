/*
 * WiFi Management Task
 * Handles AP mode, station mode, SmartConfig, and reconnection logic
 */

#define MAX_CONNECT_RETRIES 2  // Number of connection attempts before giving up

void wifiTask(void *parameter)
{
  bool ap_mode = false;
  bool ap_mode_permanent = false;  // Once true, stay in AP mode until reboot
  unsigned long connect_start = 0;
  unsigned long smartconfig_start = 0;
  bool smartconfig_active = false;
  int connect_retries = 0;

  while (true)
  {
    // If in permanent AP mode, just handle SmartConfig
    if (ap_mode_permanent)
    {
      if (smartconfig_active)
      {
        if (WiFi.smartConfigDone())
        {
          Serial.println("[WiFi] SmartConfig: credentials received!");

          // Flash LED green twice
          for (int i = 0; i < 2; i++)
          {
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

        // Check SmartConfig timeout - restart listener periodically
        if (millis() - smartconfig_start > SMARTCONFIG_TIMEOUT_MS)
        {
          Serial.println("[WiFi] SmartConfig timeout, restarting listener");
          smartconfig_start = millis();
          WiFi.beginSmartConfig();
        }
      }

      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    // Check if we have WiFi credentials
    if (config.wifi_ssid.length() == 0)
    {
      // No credentials, enter AP mode permanently
      if (!ap_mode)
      {
        Serial.println("[WiFi] No credentials found, entering AP mode");
        startAPMode();
        ap_mode = true;
        ap_mode_permanent = true;
        state.ap_mode_active = true;
        led_state = LED_AP_MODE;
        smartconfig_active = true;
        smartconfig_start = millis();
      }
    }
    else
    {
      // Have credentials, try to connect
      if (!state.wifi_connected)
      {
        if (connect_start == 0)
        {
          connect_retries++;
          Serial.printf("[WiFi] Connecting to: %s (attempt %d/%d)\n",
                        config.wifi_ssid.c_str(), connect_retries, MAX_CONNECT_RETRIES);

          // Stop any active SmartConfig before switching modes
          if (smartconfig_active)
          {
            WiFi.stopSmartConfig();
            smartconfig_active = false;
            delay(100);
          }

          WiFi.mode(WIFI_STA);
          WiFi.begin(config.wifi_ssid.c_str(), config.wifi_password.c_str());
          WiFi.setHostname(config.device_name.c_str());
          connect_start = millis();
          led_state = LED_CONNECTING;
        }

        // Check connection status
        if (WiFi.status() == WL_CONNECTED)
        {
          state.wifi_connected = true;
          connect_retries = 0;  // Reset retry counter on success
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
          state.ap_mode_active = false;
        }
        else if (millis() - connect_start > AP_TIMEOUT_MS)
        {
          // Connection timeout
          Serial.println("[WiFi] Connection timeout");

          // Fully disconnect and wait for WiFi to settle
          WiFi.disconnect(true);
          delay(100);
          WiFi.mode(WIFI_OFF);
          delay(100);

          connect_start = 0;

          // Check if we've exhausted retries
          if (connect_retries >= MAX_CONNECT_RETRIES)
          {
            Serial.printf("[WiFi] Max retries (%d) reached, entering AP mode permanently\n", MAX_CONNECT_RETRIES);
            Serial.println("[WiFi] Update credentials via web interface or reboot to retry");

            startAPMode();
            ap_mode = true;
            ap_mode_permanent = true;
            state.ap_mode_active = true;
            led_state = LED_AP_MODE;
            smartconfig_active = true;
            smartconfig_start = millis();
          }
          else
          {
            Serial.println("[WiFi] Will retry connection...");
            // connect_start is already 0, so next loop iteration will retry
          }
        }
      }
      else
      {
        // Connected, monitor connection
        if (WiFi.status() != WL_CONNECTED)
        {
          Serial.println("[WiFi] Connection lost!");
          state.wifi_connected = false;
          led_state = LED_ERROR;
          connect_start = 0;
          connect_retries = 0;  // Reset retries for reconnection attempts
          MDNS.end();
          server.stop();
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(500));
  }
}

void startAPMode()
{
  uint8_t mac[6];
  WiFi.macAddress(mac);
  String ap_ssid = String("DMX-Bridge-") +
                   String(mac[4], HEX) + String(mac[5], HEX);
  ap_ssid.toUpperCase();

  // Use AP_STA mode to allow both AP and SmartConfig to work simultaneously
  WiFi.mode(WIFI_AP_STA);

  // Small delay to let mode change settle
  delay(200);

  WiFi.softAP(ap_ssid.c_str());

  // Wait for AP to be ready
  delay(100);

  Serial.printf("[WiFi] AP Mode started: %s\n", ap_ssid.c_str());
  Serial.printf("  IP: %s\n", WiFi.softAPIP().toString().c_str());

  // Start captive portal
  setupAPI();

  // Start SmartConfig listener (works because we're in AP_STA mode)
  if (WiFi.beginSmartConfig())
  {
    Serial.println("[WiFi] SmartConfig listener started");
  }
  else
  {
    Serial.println("[WiFi] SmartConfig failed to start");
  }
}

void startMDNS()
{
  if (MDNS.begin(config.device_name.c_str()))
  {
    Serial.printf("[mDNS] Started: %s.local\n", config.device_name.c_str());

    // Advertise service
    MDNS.addService("_sacn-dmx", "_tcp", 80);
    MDNS.addServiceTxt("_sacn-dmx", "_tcp", "universe", String(config.sacn_universe));
    MDNS.addServiceTxt("_sacn-dmx", "_tcp", "mac", getMacAddress());
    MDNS.addServiceTxt("_sacn-dmx", "_tcp", "version", FIRMWARE_VERSION);
  }
  else
  {
    Serial.println("[mDNS] Failed to start");
  }
}
