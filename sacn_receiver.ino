/*
 * sACN Receiver Task
 * Listens for E1.31 packets and updates DMX buffer
 * Using sstaub/sACN library
 */

void sacnTask(void *parameter)
{
  // Wait for WiFi to be ready
  while (!state.wifi_connected)
  {
    vTaskDelay(pdMS_TO_TICKS(100));
  }

  // Initialize sACN receiver for our universe
  sacn.begin(config.sacn_universe);
  sacn.callbackDMX(onDMXFrame);

  Serial.printf("[sACN] Listening on universe %d\n", config.sacn_universe);

  while (true)
  {
    if (state.wifi_connected)
    {
      // Update receiver to process incoming packets
      sacn.update();
      vTaskDelay(pdMS_TO_TICKS(1));
    }
    else
    {
      state.sacn_receiving = false;
      vTaskDelay(pdMS_TO_TICKS(500));
    }
  }
}

// Callback function when DMX frame is received
void onDMXFrame()
{
  // Update statistics
  state.sacn_packets_received++;
  state.last_packet_time = millis();
  state.sacn_receiving = true;

  // Extract source information using public methods
  state.sacn_source_ip = "N/A"; // Not easily accessible
  state.sacn_source_name = String(sacn.name());
  state.sacn_priority = 100; // Not exposed by library

  // Update DMX buffer (thread-safe)
  if (xSemaphoreTake(dmx_mutex, pdMS_TO_TICKS(10)) == pdTRUE)
  {
    // Copy DMX channel data using dmx() accessor
    // DMX channels are 1-indexed in the library (1-512)
    for (int i = 0; i < DMX_PACKET_SIZE; i++)
    {
      dmx_data[i] = sacn.dmx(i + 1);
    }
    xSemaphoreGive(dmx_mutex);
  }

  // Turn off LED after first packet
  if (led_state == LED_CONNECTED)
  {
    led_state = LED_OFF;
  }
}
