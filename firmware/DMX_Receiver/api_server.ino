/*
 * JSON API Server
 * Implements all REST endpoints and captive portal
 */

void setupAPI()
{
  // Status endpoint
  server.on("/api/status", HTTP_GET, handleAPIStatus);

  // Config endpoints
  server.on("/api/config", HTTP_GET, handleAPIGetConfig);
  server.on("/api/config", HTTP_POST, handleAPIPostConfig);

  // Reboot endpoint
  server.on("/api/reboot", HTTP_POST, handleAPIReboot);

  // Identify endpoint
  server.on("/api/identify", HTTP_POST, handleAPIIdentify);

  // DMX direct control endpoints
  server.on("/api/dmx", HTTP_GET, handleAPIGetDMX);
  server.on("/api/dmx", HTTP_POST, handleAPIPostDMX);

  // Firmware endpoints
  server.on("/api/firmware", HTTP_GET, handleAPIGetFirmware);
  server.on("/api/firmware", HTTP_POST, handleAPIPostFirmware, handleFirmwareUpload);
  server.on("/api/firmware/rollback", HTTP_POST, handleAPIFirmwareRollback);

  // Captive portal
  server.on("/", HTTP_GET, handleCaptivePortal);
  server.on("/configure", HTTP_POST, handleCaptivePortalSubmit);

  // Catch-all for captive portal
  server.onNotFound(handleCaptivePortal);

  server.enableCORS(true);

  server.begin();
  Serial.println("[HTTP] Server started on port 80");
}

void handleAPIStatus()
{
  StaticJsonDocument<1024> doc;

  doc["device_name"] = config.device_name;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["wifi_connected"] = state.wifi_connected;
  doc["wifi_ssid"] = config.wifi_ssid;

  if (state.wifi_connected)
  {
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["wifi_signal_quality"] = getSignalQuality(WiFi.RSSI());
    doc["ip_address"] = WiFi.localIP().toString();
  }

  doc["mac_address"] = getMacAddress();
  doc["sacn_universe"] = config.sacn_universe;
  doc["dmx_start_channel"] = config.dmx_start_channel;
  doc["sacn_packets_received"] = state.sacn_packets_received;
  doc["sacn_packets_errors"] = state.sacn_packets_errors;

  if (state.sacn_receiving && state.last_packet_time > 0)
  {
    doc["sacn_source_ip"] = state.sacn_source_ip;
    doc["sacn_source_name"] = state.sacn_source_name;
    doc["sacn_priority"] = state.sacn_priority;
    doc["last_packet_ms_ago"] = millis() - state.last_packet_time;
  }

  doc["dmx_fps"] = state.dmx_fps;
  doc["uptime_seconds"] = (millis() - state.uptime_start) / 1000;
  doc["free_heap_bytes"] = ESP.getFreeHeap();
  doc["min_free_heap_bytes"] = state.min_free_heap;
  doc["reboot_count"] = state.reboot_count;
  doc["last_reboot_reason"] = state.last_reboot_reason;

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleAPIGetConfig()
{
  StaticJsonDocument<256> doc;

  doc["device_name"] = config.device_name;
  doc["sacn_universe"] = config.sacn_universe;
  doc["dmx_start_channel"] = config.dmx_start_channel;
  doc["wifi_ssid"] = config.wifi_ssid;

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleAPIPostConfig()
{
  if (!server.hasArg("plain"))
  {
    sendError(400, "Missing request body");
    return;
  }

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, server.arg("plain"));

  if (error)
  {
    sendError(400, "Invalid JSON format");
    return;
  }

  bool wifi_changed = false;
  bool reboot_required = false;

  // Validate and update WiFi SSID
  if (doc.containsKey("wifi_ssid"))
  {
    String ssid = doc["wifi_ssid"].as<String>();
    if (ssid.length() == 0 || ssid.length() > 32)
    {
      sendError(400, "WiFi SSID must be 1-32 characters");
      return;
    }
    config.wifi_ssid = ssid;
    wifi_changed = true;
  }

  // Validate and update WiFi password
  if (doc.containsKey("wifi_password"))
  {
    String pass = doc["wifi_password"].as<String>();
    if (pass.length() < 8 || pass.length() > 63)
    {
      sendError(400, "WiFi password must be 8-63 characters");
      return;
    }
    config.wifi_password = pass;
    wifi_changed = true;
  }

  // Validate and update sACN universe
  if (doc.containsKey("sacn_universe"))
  {
    uint16_t universe = doc["sacn_universe"];
    if (universe < 1 || universe > 63999)
    {
      sendError(400, "Universe must be 1-63999");
      return;
    }
    config.sacn_universe = universe;
    reboot_required = true;
  }

  // Validate and update DMX start channel
  if (doc.containsKey("dmx_start_channel"))
  {
    uint16_t start_ch = doc["dmx_start_channel"];
    if (start_ch < 1 || start_ch > 512)
    {
      sendError(400, "DMX start channel must be 1-512");
      return;
    }
    config.dmx_start_channel = start_ch;
  }

  // Validate and update device name
  if (doc.containsKey("device_name"))
  {
    String name = doc["device_name"].as<String>();
    if (name.length() == 0 || name.length() > 32)
    {
      sendError(400, "Device name must be 1-32 characters");
      return;
    }
    config.device_name = name;
    reboot_required = true;
  }

  // Save configuration
  saveConfig();

  // Send response
  StaticJsonDocument<256> response;
  response["success"] = true;
  response["reboot_required"] = wifi_changed || reboot_required;

  if (wifi_changed || reboot_required)
  {
    response["message"] = "Configuration updated. Reboot required for changes to take effect.";
  }
  else
  {
    response["message"] = "Configuration updated.";
  }

  String json;
  serializeJson(response, json);
  server.send(200, "application/json", json);
}

void handleAPIReboot()
{
  StaticJsonDocument<128> doc;
  doc["success"] = true;
  doc["message"] = "Rebooting in 1 second.";

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);

  delay(1000);
  ESP.restart();
}

void handleAPIIdentify()
{
  // Default 5 seconds, allow override via JSON body
  uint16_t duration_seconds = 5;

  if (server.hasArg("plain"))
  {
    StaticJsonDocument<128> doc;
    DeserializationError error = deserializeJson(doc, server.arg("plain"));
    if (!error && doc.containsKey("duration"))
    {
      duration_seconds = doc["duration"].as<uint16_t>();
      // Clamp to reasonable range (1-30 seconds)
      if (duration_seconds < 1)
        duration_seconds = 1;
      if (duration_seconds > 30)
        duration_seconds = 30;
    }
  }

  // Set identify end time and trigger LED state
  identify_end_time = millis() + (duration_seconds * 1000);
  led_state = LED_IDENTIFY;

  StaticJsonDocument<128> doc;
  doc["success"] = true;
  doc["message"] = "Identifying device";
  doc["duration_seconds"] = duration_seconds;

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);

  Serial.printf("[API] Identify triggered for %d seconds\n", duration_seconds);
}

void handleAPIGetFirmware()
{
  const esp_partition_t *running = esp_ota_get_running_partition();
  const esp_partition_t *update = esp_ota_get_next_update_partition(NULL);

  StaticJsonDocument<256> doc;
  doc["current_version"] = FIRMWARE_VERSION;
  doc["rollback_available"] = (update != NULL);
  doc["update_confirmed"] = true;

  if (running)
  {
    doc["current_partition"] = String(running->label) + " (active)";
  }

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleAPIPostFirmware()
{
  StaticJsonDocument<128> doc;

  if (Update.hasError())
  {
    doc["success"] = false;
    doc["error"] = "Firmware upload failed";
    String response;
    serializeJson(doc, response);
    server.send(500, "application/json", response);
  }
  else
  {
    doc["success"] = true;
    doc["message"] = "Firmware uploaded successfully. Rebooting...";
    doc["new_version"] = "uploaded";
    doc["previous_version"] = FIRMWARE_VERSION;
    doc["rebooting"] = true;

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);

    delay(2000);
    ESP.restart();
  }
}

void handleFirmwareUpload()
{
  HTTPUpload &upload = server.upload();

  if (upload.status == UPLOAD_FILE_START)
  {
    Serial.printf("[OTA] Starting firmware update: %s\n", upload.filename.c_str());

    if (!Update.begin(UPDATE_SIZE_UNKNOWN))
    {
      Update.printError(Serial);
    }
  }
  else if (upload.status == UPLOAD_FILE_WRITE)
  {
    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize)
    {
      Update.printError(Serial);
    }
  }
  else if (upload.status == UPLOAD_FILE_END)
  {
    if (Update.end(true))
    {
      Serial.printf("[OTA] Update success. Size: %u bytes\n", upload.totalSize);
    }
    else
    {
      Update.printError(Serial);
    }
  }
}

void handleAPIFirmwareRollback()
{
  const esp_partition_t *update = esp_ota_get_next_update_partition(NULL);

  if (update == NULL)
  {
    sendError(400, "No previous firmware available for rollback");
    return;
  }

  StaticJsonDocument<256> doc;
  doc["success"] = true;
  doc["message"] = "Rolling back to previous firmware";
  doc["current_version"] = FIRMWARE_VERSION;
  doc["rebooting"] = true;

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);

  delay(1000);

  esp_ota_set_boot_partition(update);
  ESP.restart();
}

void handleAPIGetDMX()
{
  // Optional query params: start (1-512), count (1-512)
  uint16_t start = 1;
  uint16_t count = 512;

  if (server.hasArg("start"))
  {
    start = server.arg("start").toInt();
    if (start < 1 || start > 512)
      start = 1;
  }

  if (server.hasArg("count"))
  {
    count = server.arg("count").toInt();
    if (count < 1 || count > 512)
      count = 512;
  }

  // Clamp to valid range
  if (start + count - 1 > 512)
    count = 513 - start;

  // Read DMX buffer (thread-safe)
  uint8_t local_buffer[DMX_PACKET_SIZE];
  if (xSemaphoreTake(dmx_mutex, pdMS_TO_TICKS(50)) == pdTRUE)
  {
    memcpy(local_buffer, dmx_data, DMX_PACKET_SIZE);
    xSemaphoreGive(dmx_mutex);
  }

  // Build response - use DynamicJsonDocument for potentially large array
  DynamicJsonDocument doc(4096);
  doc["start"] = start;
  doc["count"] = count;
  JsonArray channels = doc.createNestedArray("channels");
  for (uint16_t i = 0; i < count; i++)
  {
    channels.add(local_buffer[start - 1 + i]);
  }

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleAPIPostDMX()
{
  if (!server.hasArg("plain"))
  {
    sendError(400, "Missing request body");
    return;
  }

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, server.arg("plain"));

  if (error)
  {
    sendError(400, "Invalid JSON format");
    return;
  }

  uint16_t channels_set = 0;

  if (xSemaphoreTake(dmx_mutex, pdMS_TO_TICKS(50)) == pdTRUE)
  {
    // Mode 1: Key-value pairs {"channels": {"1": 255, "10": 128}}
    if (doc.containsKey("channels") && doc["channels"].is<JsonObject>())
    {
      JsonObject channels = doc["channels"];
      for (JsonPair kv : channels)
      {
        uint16_t ch = String(kv.key().c_str()).toInt();
        if (ch >= 1 && ch <= 512)
        {
          uint8_t val = kv.value().as<uint8_t>();
          dmx_data[ch - 1] = val;
          channels_set++;
        }
      }
    }
    // Mode 2: Array with start offset {"start": 1, "values": [255, 128, 0]}
    else if (doc.containsKey("values") && doc["values"].is<JsonArray>())
    {
      uint16_t start = doc.containsKey("start") ? doc["start"].as<uint16_t>() : 1;
      if (start < 1)
        start = 1;
      JsonArray values = doc["values"];
      for (size_t i = 0; i < values.size() && (start - 1 + i) < 512; i++)
      {
        dmx_data[start - 1 + i] = values[i].as<uint8_t>();
        channels_set++;
      }
    }

    xSemaphoreGive(dmx_mutex);
  }
  else
  {
    sendError(500, "Could not acquire DMX buffer lock");
    return;
  }

  if (channels_set == 0)
  {
    sendError(400, "No valid channels provided. Use {\"channels\":{\"1\":255}} or {\"start\":1,\"values\":[255,128]}");
    return;
  }

  StaticJsonDocument<128> response;
  response["success"] = true;
  response["channels_set"] = channels_set;

  String json;
  serializeJson(response, json);
  server.send(200, "application/json", json);
}

void sendError(int code, String message)
{
  StaticJsonDocument<128> doc;
  doc["success"] = false;
  doc["error"] = message;

  String response;
  serializeJson(doc, response);
  server.send(code, "application/json", response);
}
