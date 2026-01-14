/*
 * Custom DMX512 Driver for ESP32-C6
 * Compatible with RISC-V architecture
 */

#include "dmx_driver.h"

DMXDriver::DMXDriver(int tx_pin) : _tx_pin(tx_pin), _initialized(false) {}

bool DMXDriver::begin() {
  // Configure UART for DMX512
  uart_config_t uart_config = {
      .baud_rate = DMX_BAUD_RATE,
      .data_bits = UART_DATA_8_BITS,
      .parity = UART_PARITY_DISABLE,
      .stop_bits = UART_STOP_BITS_2,
      .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
      .source_clk = UART_SCLK_DEFAULT,
  };

  // Install UART driver
  esp_err_t err = uart_driver_install(DMX_UART_NUM, 1024, 0, 0, NULL, 0);
  if (err != ESP_OK) {
    return false;
  }

  // Configure UART parameters
  err = uart_param_config(DMX_UART_NUM, &uart_config);
  if (err != ESP_OK) {
    uart_driver_delete(DMX_UART_NUM);
    return false;
  }

  // Set UART pins (TX only, RX not used)
  err = uart_set_pin(DMX_UART_NUM, _tx_pin, UART_PIN_NO_CHANGE,
                     UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
  if (err != ESP_OK) {
    uart_driver_delete(DMX_UART_NUM);
    return false;
  }

  _initialized = true;
  return true;
}

void DMXDriver::sendBreak() {
  // Send BREAK by setting TX pin low
  gpio_set_level((gpio_num_t)_tx_pin, 0);
  delayMicroseconds(DMX_BREAK_US);
}

void DMXDriver::sendMAB() {
  // Send Mark After Break by setting TX pin high
  gpio_set_level((gpio_num_t)_tx_pin, 1);
  delayMicroseconds(DMX_MAB_US);
}

void DMXDriver::sendPacket(const uint8_t* data, size_t length) {
  if (!_initialized) return;

  // Temporarily configure pin as GPIO for break/MAB
  gpio_config_t io_conf = {};
  io_conf.intr_type = GPIO_INTR_DISABLE;
  io_conf.mode = GPIO_MODE_OUTPUT;
  io_conf.pin_bit_mask = (1ULL << _tx_pin);
  io_conf.pull_down_en = GPIO_PULLDOWN_DISABLE;
  io_conf.pull_up_en = GPIO_PULLUP_DISABLE;
  gpio_config(&io_conf);

  // Send BREAK
  sendBreak();

  // Send MAB
  sendMAB();

  // Reconfigure as UART TX
  uart_set_pin(DMX_UART_NUM, _tx_pin, UART_PIN_NO_CHANGE,
               UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);

  // Send start code (0x00)
  uint8_t start_code = 0x00;
  uart_write_bytes(DMX_UART_NUM, &start_code, 1);

  // Send DMX data
  uart_write_bytes(DMX_UART_NUM, data, length);

  // Wait for transmission to complete
  uart_wait_tx_done(DMX_UART_NUM, pdMS_TO_TICKS(50));
}
