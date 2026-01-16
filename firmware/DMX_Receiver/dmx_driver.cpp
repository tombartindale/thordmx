/*
 * Custom DMX512 Driver for ESP32-C6
 * Uses GPIO for break signal, UART for data
 * Disables interrupts during timing-critical sections
 */

#include "dmx_driver.h"
#include "hal/uart_ll.h"

DMXDriver::DMXDriver(int tx_pin) : _tx_pin(tx_pin), _initialized(false) {}

bool DMXDriver::begin() {
  // Configure UART for DMX512: 250kbaud, 8N2
  uart_config_t uart_config = {
      .baud_rate = DMX_BAUD_RATE,
      .data_bits = UART_DATA_8_BITS,
      .parity = UART_PARITY_DISABLE,
      .stop_bits = UART_STOP_BITS_2,
      .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
      .source_clk = UART_SCLK_DEFAULT,
  };

  // Install UART driver
  esp_err_t err = uart_driver_install(DMX_UART_NUM, 256, 1024, 0, NULL, 0);
  if (err != ESP_OK) {
    Serial.printf("[DMX] uart_driver_install failed: %d\n", err);
    return false;
  }

  // Configure UART parameters
  err = uart_param_config(DMX_UART_NUM, &uart_config);
  if (err != ESP_OK) {
    Serial.printf("[DMX] uart_param_config failed: %d\n", err);
    uart_driver_delete(DMX_UART_NUM);
    return false;
  }

  // Set UART TX pin
  err = uart_set_pin(DMX_UART_NUM, _tx_pin, UART_PIN_NO_CHANGE,
                     UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
  if (err != ESP_OK) {
    Serial.printf("[DMX] uart_set_pin failed: %d\n", err);
    uart_driver_delete(DMX_UART_NUM);
    return false;
  }

  _initialized = true;
  Serial.printf("[DMX] Initialized on GPIO %d\n", _tx_pin);
  return true;
}

void DMXDriver::sendPacket(const uint8_t* data, size_t length) {
  if (!_initialized) return;

  // Wait for any previous transmission to complete
  uart_wait_tx_done(DMX_UART_NUM, pdMS_TO_TICKS(30));

  // --- CRITICAL SECTION: Generate Break and MAB ---
  // Disable interrupts to ensure precise timing
  portDISABLE_INTERRUPTS();

  // Disconnect UART from pin temporarily
  gpio_set_direction((gpio_num_t)_tx_pin, GPIO_MODE_OUTPUT);
  esp_rom_gpio_connect_out_signal(_tx_pin, SIG_GPIO_OUT_IDX, false, false);

  // BREAK: Hold line low for 100µs (min 92µs required)
  gpio_set_level((gpio_num_t)_tx_pin, 0);
  esp_rom_delay_us(100);

  // MAB: Hold line high for 12µs (min 12µs required)
  gpio_set_level((gpio_num_t)_tx_pin, 1);
  esp_rom_delay_us(12);

  // Reconnect UART TX to pin
  uart_set_pin(DMX_UART_NUM, _tx_pin, UART_PIN_NO_CHANGE,
               UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);

  // Re-enable interrupts
  portENABLE_INTERRUPTS();

  // --- Send DMX Frame ---
  // Reset TX FIFO to ensure clean state after GPIO manipulation
  uart_ll_txfifo_rst(UART_LL_GET_HW(DMX_UART_NUM));

  // Small delay to let UART settle after reconnection
  esp_rom_delay_us(8);

  // Start code (0x00)
  uint8_t start_code = 0x00;
  uart_write_bytes(DMX_UART_NUM, &start_code, 1);

  // DMX channel data (up to 512 bytes)
  size_t send_length = (length > 512) ? 512 : length;
  uart_write_bytes(DMX_UART_NUM, data, send_length);

  // Wait for transmission to complete
  uart_wait_tx_done(DMX_UART_NUM, pdMS_TO_TICKS(30));
}
