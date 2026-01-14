/*
 * DMX Output Task
 * Transmits DMX512 frames at 40Hz using custom driver
 */

void dmxTask(void* parameter) {
  const TickType_t frame_delay = pdMS_TO_TICKS(25); // 40Hz = 25ms per frame
  uint8_t local_buffer[DMX_PACKET_SIZE];
  unsigned long last_fps_calc = millis();
  unsigned long frame_count = 0;

  while (true) {
    TickType_t start_tick = xTaskGetTickCount();

    // Copy DMX data (thread-safe)
    if (xSemaphoreTake(dmx_mutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      memcpy(local_buffer, dmx_data, DMX_PACKET_SIZE);
      xSemaphoreGive(dmx_mutex);
    }

    // Serial.write(local_buffer[1]);
    // Serial.println(dmx_data[0]);
    Serial.println(local_buffer[0]);

    // Send DMX packet using custom driver
    dmx.sendPacket(local_buffer, DMX_PACKET_SIZE);

    // Update frame count
    frame_count++;
    state.dmx_frame_count++;

    // Calculate FPS every second
    unsigned long now = millis();
    if (now - last_fps_calc >= 1000) {
      state.dmx_fps = frame_count * 1000.0 / (now - last_fps_calc);
      frame_count = 0;
      last_fps_calc = now;
    }

    // Wait for next frame time
    vTaskDelayUntil(&start_tick, frame_delay);
  }
}
