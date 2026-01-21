/*
 * WiFi Management Task
 * Handles AP mode, station mode, and reconnection logic
 */

#define MAX_CONNECT_RETRIES 2  // Number of connection attempts before giving up
#define AP_RETRY_DELAY_MS 60000  // 60 seconds in AP mode before retrying connection

void wifiTask(void *parameter)
{
  bool ap_mode = false;
  bool ap_mode_permanent = false;  // Once true, stay in AP mode until reboot
  bool has_connected_since_boot = false;  // Track if we ever connected successfully
  unsigned long connect_start = 0;
  unsigned long ap_mode_start = 0;  // When we entered AP mode (for retry timer)
  int connect_retries = 0;

  while (true)
  {
    // If in permanent AP mode (never connected), nothing to do - just wait
    if (ap_mode_permanent)
    {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    // If in temporary AP mode (lost connection after successful connect), check if it's time to retry
    if (ap_mode && has_connected_since_boot && ap_mode_start > 0)
    {
      if (millis() - ap_mode_start >= AP_RETRY_DELAY_MS)
      {
        Serial.println("[WiFi] AP retry timer expired, attempting to reconnect...");
        WiFi.softAPdisconnect(true);
        delay(100);
        WiFi.mode(WIFI_OFF);
        delay(100);
        ap_mode = false;
        state.ap_mode_active = false;
        connect_retries = 0;
        ap_mode_start = 0;
      }
      else
      {
        vTaskDelay(pdMS_TO_TICKS(500));
        continue;
      }
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
          has_connected_since_boot = true;  // Mark that we've successfully connected
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
            startAPMode();
            ap_mode = true;
            state.ap_mode_active = true;
            led_state = LED_AP_MODE;

            if (has_connected_since_boot)
            {
              // Previously connected but lost connection - temporary AP mode with retry
              Serial.printf("[WiFi] Max retries (%d) reached, entering AP mode for %d seconds\n",
                            MAX_CONNECT_RETRIES, AP_RETRY_DELAY_MS / 1000);
              ap_mode_start = millis();
              ap_mode_permanent = false;
            }
            else
            {
              // Never connected since boot - permanent AP mode
              Serial.printf("[WiFi] Max retries (%d) reached, entering AP mode permanently\n", MAX_CONNECT_RETRIES);
              Serial.println("[WiFi] Update credentials via web interface or reboot to retry");
              ap_mode_permanent = true;
            }
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
          ap_mode_start = 0;
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
  String ap_ssid = String("THOR-BRIDGE-") +
                   String(mac[4], HEX) + String(mac[5], HEX);
  ap_ssid.toUpperCase();

  WiFi.mode(WIFI_AP);
  delay(100);

  WiFi.softAP(ap_ssid.c_str());
  delay(100);

  Serial.printf("[WiFi] AP Mode started: %s\n", ap_ssid.c_str());
  Serial.printf("  IP: %s\n", WiFi.softAPIP().toString().c_str());

  // Start captive portal / web server
  setupAPI();
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
