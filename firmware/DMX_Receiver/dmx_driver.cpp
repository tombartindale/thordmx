/*
 * Custom DMX512 Driver for ESP32-C6
 * Uses UART baud rate switching for break generation
 * No interrupt disabling — WiFi-safe
 */

#include "dmx_driver.h"

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

  // Install UART driver with ISR in IRAM to prevent WiFi interrupt latency
  // from causing TX FIFO underruns
  esp_err_t err = uart_driver_install(DMX_UART_NUM, 256, 1024, 0, NULL,
                                      ESP_INTR_FLAG_IRAM);
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

  size_t send_length = (length > 512) ? 512 : length;

  // Wait for any previous transmission to complete
  uart_wait_tx_done(DMX_UART_NUM, pdMS_TO_TICKS(30));

  // Generate BREAK + MAB using slow baud rate
  // Sending 0x00 at 90000 baud (8N2): 9 low bits = 100µs BREAK, 2 high bits = 22µs MAB
  uart_set_baudrate(DMX_UART_NUM, DMX_BREAK_BAUD);
  uint8_t break_byte = 0x00;
  uart_write_bytes(DMX_UART_NUM, &break_byte, 1);
  uart_wait_tx_done(DMX_UART_NUM, pdMS_TO_TICKS(30));

  // Switch back to DMX baud rate for data
  uart_set_baudrate(DMX_UART_NUM, DMX_BAUD_RATE);

  // Build complete frame: start code + channel data
  // Single write prevents any gap between start code and data
  _frame[0] = 0x00;
  memcpy(_frame + 1, data, send_length);
  uart_write_bytes(DMX_UART_NUM, _frame, send_length + 1);

  // Wait for transmission to complete
  uart_wait_tx_done(DMX_UART_NUM, pdMS_TO_TICKS(30));
}
