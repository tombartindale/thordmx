/*
 * LED Status Controller Task
 * Manages WS2812 LED to indicate device state
 */

void ledTask(void* parameter) {
  uint8_t pulse_brightness = 0;
  bool pulse_direction = true;

  while (true) {
    switch (led_state) {
      case LED_OFF:
        leds[0] = CRGB::Black;
        FastLED.show();
        break;

      case LED_AP_MODE:
        // Pulsing blue (1 second cycle)
        if (pulse_direction) {
          pulse_brightness += 5;
          if (pulse_brightness >= 200) pulse_direction = false;
        } else {
          pulse_brightness -= 5;
          if (pulse_brightness <= 30) pulse_direction = true;
        }
        leds[0] = CRGB(0, 0, pulse_brightness);
        FastLED.show();
        vTaskDelay(pdMS_TO_TICKS(20));
        break;

      case LED_CONNECTING:
        // Pulsing yellow (0.5 second cycle)
        if (pulse_direction) {
          pulse_brightness += 10;
          if (pulse_brightness >= 200) pulse_direction = false;
        } else {
          pulse_brightness -= 10;
          if (pulse_brightness <= 30) pulse_direction = true;
        }
        leds[0] = CRGB(pulse_brightness, pulse_brightness / 2, 0);
        FastLED.show();
        vTaskDelay(pdMS_TO_TICKS(10));
        break;

      case LED_CONNECTED:
        // Solid green for 2 seconds
        leds[0] = CRGB::Green;
        FastLED.show();
        vTaskDelay(pdMS_TO_TICKS(2000));
        led_state = LED_OFF;
        break;

      case LED_ERROR:
        // Solid red
        leds[0] = CRGB::Red;
        FastLED.show();
        vTaskDelay(pdMS_TO_TICKS(100));
        break;

      case LED_SMARTCONFIG:
        // Same as AP mode (pulsing blue)
        if (pulse_direction) {
          pulse_brightness += 5;
          if (pulse_brightness >= 200) pulse_direction = false;
        } else {
          pulse_brightness -= 5;
          if (pulse_brightness <= 30) pulse_direction = true;
        }
        leds[0] = CRGB(0, 0, pulse_brightness);
        FastLED.show();
        vTaskDelay(pdMS_TO_TICKS(20));
        break;

      case LED_IDENTIFY:
        // Fast flashing white/magenta for identification
        if (millis() < identify_end_time) {
          // Alternate between white and magenta every 200ms
          if ((millis() / 200) % 2 == 0) {
            leds[0] = CRGB::White;
          } else {
            leds[0] = CRGB::Magenta;
          }
          FastLED.show();
          vTaskDelay(pdMS_TO_TICKS(50));
        } else {
          // Identify period ended, turn off
          led_state = LED_OFF;
        }
        break;
    }

    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
