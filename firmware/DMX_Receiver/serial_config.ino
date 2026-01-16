/*
 * Serial Configuration Interface
 * Handles CONFIG, STATUS, REBOOT, and FACTORY_RESET commands
 */

void serialTask(void* parameter) {
  String command_buffer = "";

  while (true) {
    while (Serial.available() > 0) {
      char c = Serial.read();

      if (c == '\n' || c == '\r') {
        if (command_buffer.length() > 0) {
          processSerialCommand(command_buffer);
          command_buffer = "";
        }
      } else {
        command_buffer += c;
      }
    }

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

void processSerialCommand(String command) {
  command.trim();

  if (command == "STATUS") {
    handleSerialStatus();
  } else if (command == "REBOOT") {
    handleSerialReboot();
  } else if (command == "FACTORY_RESET") {
    handleSerialFactoryReset();
  } else if (command.startsWith("CONFIG:")) {
    handleSerialConfig(command.substring(7));
  } else {
    Serial.println("ERROR:{\"message\":\"Unknown command\"}");
  }
}

void handleSerialStatus() {
  StaticJsonDocument<1024> doc;

  doc["device_name"] = config.device_name;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["wifi_connected"] = state.wifi_connected;
  doc["wifi_ssid"] = config.wifi_ssid;

  if (state.wifi_connected) {
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["wifi_signal_quality"] = getSignalQuality(WiFi.RSSI());
    doc["ip_address"] = WiFi.localIP().toString();
  }

  doc["mac_address"] = getMacAddress();
  doc["sacn_universe"] = config.sacn_universe;
  doc["sacn_packets_received"] = state.sacn_packets_received;
  doc["sacn_packets_errors"] = state.sacn_packets_errors;
  doc["uptime_seconds"] = (millis() - state.uptime_start) / 1000;
  doc["free_heap_bytes"] = ESP.getFreeHeap();
  doc["min_free_heap_bytes"] = state.min_free_heap;
  doc["reboot_count"] = state.reboot_count;
  doc["last_reboot_reason"] = state.last_reboot_reason;

  Serial.print("OK:");
  serializeJson(doc, Serial);
  Serial.println();
}

void handleSerialConfig(String json_str) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, json_str);

  if (error) {
    Serial.printf("ERROR:{\"message\":\"Invalid JSON format: %s\"}\n", error.c_str());
    return;
  }

  bool wifi_changed = false;

  // Update WiFi SSID
  if (doc.containsKey("wifi_ssid")) {
    String ssid = doc["wifi_ssid"].as<String>();
    if (ssid.length() > 0 && ssid.length() <= 32) {
      config.wifi_ssid = ssid;
      wifi_changed = true;
    }
  }

  // Update WiFi password
  if (doc.containsKey("wifi_password")) {
    String pass = doc["wifi_password"].as<String>();
    if (pass.length() >= 8 && pass.length() <= 63) {
      config.wifi_password = pass;
      wifi_changed = true;
    } else if (pass.length() > 0) {
      Serial.println("ERROR:{\"message\":\"WiFi password must be 8-63 characters\"}");
      return;
    }
  }

  // Update sACN universe
  if (doc.containsKey("sacn_universe")) {
    uint16_t universe = doc["sacn_universe"];
    if (universe >= 1 && universe <= 63999) {
      config.sacn_universe = universe;
    } else {
      Serial.println("ERROR:{\"message\":\"Universe must be 1-63999\"}");
      return;
    }
  }

  // Update device name
  if (doc.containsKey("device_name")) {
    String name = doc["device_name"].as<String>();
    if (name.length() > 0 && name.length() <= 32) {
      config.device_name = name;
    } else {
      Serial.println("ERROR:{\"message\":\"Device name must be 1-32 characters\"}");
      return;
    }
  }

  // Save configuration
  saveConfig();

  // Send response
  StaticJsonDocument<128> response;
  response["message"] = "Configuration saved";
  response["reboot_required"] = wifi_changed;

  Serial.print("OK:");
  serializeJson(response, Serial);
  Serial.println();

  // Reboot if WiFi changed
  if (wifi_changed) {
    Serial.println("REBOOTING...");
    delay(2000);
    ESP.restart();
  }
}

void handleSerialReboot() {
  Serial.println("OK:{\"message\":\"Rebooting now\"}");
  delay(500);
  ESP.restart();
}

void handleSerialFactoryReset() {
  Serial.println("OK:{\"message\":\"Factory reset initiated\"}");
  delay(500);

  // Clear all preferences
  prefs.clear();

  Serial.println("REBOOTING...");
  delay(1000);
  ESP.restart();
}
