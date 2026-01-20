#!/bin/bash
esptool --chip esp32c6 elf2image ./build/esp32.esp32.esp32c6/DMX_Receiver.ino.elf -o ../bin/flash_file.bin