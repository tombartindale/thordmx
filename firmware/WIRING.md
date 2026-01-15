# Wiring Guide

Detailed wiring instructions for the sACN to DMX Bridge.

## Components Needed

- ESP32-C6 Development Board
- MAX485 RS-485 Transceiver Module
- WS2812 RGB LED (optional, for status indication)
- 5-pin XLR connector (female) for DMX output
- 120Ω resistor (for DMX termination - optional)
- Power supply (5V USB or external)
- Wire, solder, enclosure

## Pinout

### ESP32-C6 Connections

| ESP32-C6 Pin | Function | Connects To |
|--------------|----------|-------------|
| GPIO 0 | DMX TX | MAX485 DI (pin 1) |
| GPIO 8 | Status LED | WS2812 Data In |
| GND | Ground | MAX485 GND, WS2812 GND, DMX GND |
| 5V/3.3V | Power | MAX485 VCC (check module voltage) |

### MAX485 Module Connections

| MAX485 Pin | Function | Connects To |
|------------|----------|-------------|
| DI | Data In | ESP32-C6 GPIO 0 |
| DE | Driver Enable | 5V or 3.3V (always enabled) |
| RE | Receiver Enable (inverse) | GND (receiver disabled) |
| RO | Receiver Out | Not connected |
| VCC | Power | 5V or 3.3V (match ESP32 output) |
| GND | Ground | ESP32-C6 GND |
| A | Data+ | XLR Pin 3 |
| B | Data- | XLR Pin 2 |

### DMX XLR Connector (Female)

Standard 5-pin XLR connector pinout:

| XLR Pin | Signal | Wire Color (typical) | Connects To |
|---------|--------|---------------------|-------------|
| 1 | Ground | Black/Shield | MAX485 GND |
| 2 | Data- | Blue/White | MAX485 B |
| 3 | Data+ | Red/Green | MAX485 A |
| 4 | N/C | - | Not connected |
| 5 | N/C | - | Not connected |

**Note**: 3-pin XLR is also common - use pins 1, 2, 3 only.

## Wiring Diagram (ASCII)

```
                    ┌─────────────────┐
                    │   ESP32-C6      │
                    │                 │
  ┌─────────────────┤ GPIO 0 (TX)     │
  │                 │                 │
  │  ┌──────────────┤ GPIO 8          │───────┐
  │  │              │                 │       │
  │  │         ┌────┤ GND             │──┐    │
  │  │         │    │                 │  │    │
  │  │         │ ┌──┤ 5V/3.3V         │  │    │
  │  │         │ │  └─────────────────┘  │    │
  │  │         │ │                       │    │
  │  │         │ │  ┌─────────────────┐  │    │
  │  │         │ │  │    MAX485       │  │    │
  │  └─────────┼─┼──┤ DI (1)          │  │    │
  │            │ │  │ DE (4) ─────────┼──┘    │
  │            │ │  │ RE (2) ─────────┼───────┤
  │            │ └──┤ VCC             │       │
  │            └────┤ GND             │       │
  │                 │                 │       │
  │            ┌────┤ A (6)           │       │
  │            │    │ B (7)           │       │
  │            │    └─────────────────┘       │
  │            │                              │
  │            │    ┌─────────────────┐       │
  │            │    │   DMX XLR       │       │
  │            ├────┤ Pin 3 (Data+)   │       │
  │            │    │ Pin 2 (Data-)   │       │
  │            │  ┌─┤ Pin 1 (Ground)  │       │
  │            │  │ └─────────────────┘       │
  │            │  │                           │
  │            │  │ ┌─────────────────┐       │
  │            │  │ │   WS2812 LED    │       │
  │            │  │ │ VCC (5V)────────┼───────┘
  │            │  └─┤ GND             │
  └──────────────┼──┤ Data In         │
                 │  └─────────────────┘
                 │
              Common Ground
```

## Step-by-Step Assembly

### 1. Prepare the MAX485 Module

Most MAX485 modules need to be configured for TX-only mode:

1. **Connect DE (Driver Enable) to VCC** (5V or 3.3V)
   - This enables the driver permanently
   - Some modules have a jumper for this

2. **Connect RE (Receiver Enable) to GND**
   - Active low - connecting to ground disables receiver
   - We don't need to receive DMX data

### 2. Wire ESP32-C6 to MAX485

```
ESP32-C6          MAX485
────────          ──────
GPIO 0    ───────> DI
5V        ───────> VCC (check module voltage requirement)
GND       ───────> GND
```

**Important**: Some MAX485 modules work with 3.3V, others need 5V. Check your module's datasheet.

### 3. Wire MAX485 to XLR Connector

```
MAX485            XLR Connector
──────            ─────────────
A         ───────> Pin 3 (Data+, typically red/green wire)
B         ───────> Pin 2 (Data-, typically blue/white wire)
GND       ───────> Pin 1 (Ground, typically black wire)
```

### 4. Add Status LED (Optional)

```
ESP32-C6          WS2812
────────          ──────
GPIO 8    ───────> Data In
5V        ───────> VCC
GND       ───────> GND
```

**Note**: WS2812 requires 5V power. If using 3.3V GPIO, add a level shifter or use a WS2812 compatible with 3.3V logic.

### 5. Power Supply

Connect 5V power to ESP32-C6:
- Via USB-C connector (easiest for development)
- Via VIN pin (for external 5V supply)

**Power Requirements**:
- ESP32-C6: ~200mA (with WiFi active)
- MAX485: ~10mA
- WS2812 LED: ~60mA (at full white)
- **Total**: ~300mA minimum, 500mA recommended

## DMX Cable Specifications

### Cable Type
- Use shielded twisted pair cable
- Characteristic impedance: 120Ω
- Examples:
  - DMX-specific cable (best)
  - Microphone cable (acceptable for short runs)
  - CAT5 ethernet cable (works in a pinch)

### Cable Length
- Maximum recommended: 300 meters (1000 feet)
- For longer runs, use DMX repeater/booster

### Termination
- Last device in DMX chain should have 120Ω terminator
- Connect 120Ω resistor between XLR pins 2 and 3
- Not needed for short cable runs or single fixture

## Testing Connections

### 1. Visual Inspection
- Check all solder joints
- Verify no shorts between A and B lines
- Confirm correct polarity

### 2. Multimeter Tests

**Power Test**:
```
Measure between ESP32 5V and GND: Should read ~5V
Measure between MAX485 VCC and GND: Should read ~5V or ~3.3V
```

**DMX Output Test** (device powered, transmitting):
```
Measure between MAX485 A and B: Should see ~2-5V differential
Measure with oscilloscope: Should see ~250kHz square wave
```

### 3. LED Test
- Power on device
- LED should pulse blue (AP mode)
- If no LED: check wiring, try different GPIO or LED

## Common Wiring Mistakes

| Problem | Cause | Solution |
|---------|-------|----------|
| No DMX output | DE/RE not configured | Tie DE high, RE low |
| Intermittent output | Loose connection | Re-solder all joints |
| DMX A/B swapped | Reversed polarity | Swap pins 2 and 3 on XLR |
| LED doesn't work | Wrong voltage | WS2812 needs 5V |
| ESP32 won't boot | GPIO 0 pulled low at boot | Add 10kΩ pull-up resistor |

## Advanced: PCB Design Considerations

If designing a custom PCB:

1. **Add pull-up on GPIO 0**: 10kΩ to 3.3V (prevents boot issues)
2. **Add decoupling capacitors**:
   - 100nF ceramic near each IC
   - 10µF electrolytic on power supply
3. **Add TVS diodes** on DMX lines for ESD protection
4. **Add indicator LEDs**:
   - Power LED
   - DMX activity LED (on TX line with series resistor)
5. **Add termination option**: Footprint for 120Ω resistor with jumper
6. **Use proper grounding**: Star ground pattern, separate digital/analog grounds

## Enclosure Recommendations

- Use metal or shielded plastic enclosure for EMI protection
- Add ventilation holes (ESP32 can get warm)
- Mount XLR connector securely to chassis
- Use strain relief on all cables
- Label clearly: "DMX OUTPUT", "POWER", etc.

## Safety Notes

⚠️ **Important Safety Information**:

- DMX is low voltage (5V differential) - safe to touch
- Do NOT connect to mains power
- Use proper fuses on power supply
- Ensure proper polarity on all connections
- Test with multimeter before connecting expensive equipment

## Reference Photos

For reference wiring, see similar projects:
- https://github.com/Aircoookie/WLED (WiFi LED controller with similar architecture)
- ESP32 DMX projects on Hackaday.io

---

**Need help?** Check the troubleshooting section in README.md or open an issue.
