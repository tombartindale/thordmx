/*
 * Custom DMX512 Driver for ESP32-C6
 * Compatible with RISC-V architecture
 */

#ifndef DMX_DRIVER_H
#define DMX_DRIVER_H

#include <Arduino.h>
#include <driver/uart.h>
#include <driver/gpio.h>

#define DMX_UART_NUM UART_NUM_1
#define DMX_BREAK_US 100      // Break time in microseconds (min 92us)
#define DMX_MAB_US 12         // Mark After Break in microseconds (min 12us)
#define DMX_BAUD_RATE 250000  // DMX baud rate

class DMXDriver {
public:
  DMXDriver(int tx_pin);
  bool begin();
  void sendPacket(const uint8_t* data, size_t length);

private:
  int _tx_pin;
  bool _initialized;
};

#endif // DMX_DRIVER_H
