# sACN Color Controller - .NET MAUI App Spec

## Overview

A minimal Android app built with .NET MAUI that sends sACN (E1.31) data to DMX receivers on the local network. The app presents a color wheel for selecting an RGB color, which is transmitted as channels 1 (Red), 2 (Green), and 3 (Blue) on universe 1.

## Platform

- **Framework:** .NET MAUI (.NET 8+)
- **Target:** Android (API 24+)
- **Future:** iOS support may be added later; keep platform-specific code isolated
- **IDE:** Visual Studio Code

## Development Environment

### Prerequisites

- .NET 8 SDK (or later)
- Android SDK (API 24+) — installed via Android SDK Manager or `dotnet workload install maui-android`
- Java JDK 17 (required by Android SDK tooling)

### VS Code Extensions

| Extension | ID | Purpose |
|---|---|---|
| C# Dev Kit | `ms-dotnettools.csdevkit` | Core C# language support, project system, solution explorer |
| .NET MAUI | `ms-dotnettools.dotnet-maui` | MAUI project templates, XAML IntelliSense, device targeting, debug/deploy |
| XAML | `ms-dotnettools.vscode-dotnet-runtime` | .NET runtime acquisition (dependency of above) |

### Workload Setup

```bash
dotnet workload install maui-android
```

### Build & Run

```bash
# Build
dotnet build -f net8.0-android

# Deploy to connected device / emulator
dotnet build -f net8.0-android -t:Run
```

### Debugging

- Use the **.NET MAUI** debug launch configuration in VS Code (provided by the MAUI extension)
- Select the target Android device/emulator from the MAUI device picker in the status bar

## Core Features

### 1. Color Wheel Input

- Full-screen color wheel (or color disc) as the primary UI element
- Touch-driven: drag finger across the wheel to select hue/saturation, with a brightness slider alongside
- Selection updates continuously as the user drags (no submit button)
- Display the selected color as a preview swatch and show the RGB values (0–255) as text beneath the wheel
- Responsive to screen size; wheel should fill available width

### 2. sACN Output

- Transmit E1.31 (sACN) multicast UDP packets on the standard multicast address for universe 1: `239.255.0.1`
- Port: `5568`
- Protocol details:
  - E1.31 data packet (vector `0x00000004`)
  - Root layer, framing layer, DMP layer per ANSI E1.31-2018
  - Universe: `1`
  - Priority: `100` (default)
  - Channel data: 512 bytes (slots), only slots 1–3 populated (R, G, B), remainder zero
  - Sequence number: increment per packet (0–255, wrapping)
  - Source name: `"MAUI sACN Controller"` (UTF-8, 64 bytes padded)
  - CID: generate once on first launch, persist in app preferences
- **Transmission rate:** send packets at ~22 Hz (every ~45 ms) while the color is changing, drop to ~1 Hz keep-alive when idle (no touch for >1 second)
- Use `System.Net.Sockets.UdpClient` for multicast UDP

### 3. Network Status Warning

- On launch and on resume, check for active Wi-Fi connectivity using MAUI's `Connectivity` API (`NetworkAccess` and `ConnectionProfiles`)
- If no Wi-Fi connection is detected, show a non-dismissable banner at the top of the screen: **"No Wi-Fi connection — sACN output disabled"**
- Disable packet transmission while Wi-Fi is unavailable
- Subscribe to `Connectivity.ConnectivityChanged` to update the banner in real time
- When Wi-Fi reconnects, dismiss the banner and resume transmission

## UI Layout

```
┌─────────────────────────────┐
│ ⚠ No Wi-Fi (if applicable) │  <- warning banner (yellow/orange)
├─────────────────────────────┤
│                             │
│                             │
│        Color Wheel          │  <- touch-interactive disc
│        (hue + sat)          │
│                             │
│                             │
├─────────────────────────────┤
│  ☀ Brightness Slider        │  <- horizontal slider (0–100%)
├─────────────────────────────┤
│  ┌──────┐  R: 255           │
│  │preview│  G: 128           │  <- color swatch + RGB readout
│  │swatch │  B: 0             │
│  └──────┘                   │
└─────────────────────────────┘
```

- Single page, no navigation
- Dark background (`#1E1E1E`) so colors stand out
- Minimal chrome — the color wheel is the hero element

## Project Structure

```
SacnController/
├── SacnController.csproj
├── App.xaml / App.xaml.cs
├── MauiProgram.cs
├── MainPage.xaml / MainPage.xaml.cs
├── Services/
│   ├── SacnService.cs            # packet building & UDP transmission
│   └── NetworkMonitorService.cs  # Wi-Fi connectivity monitoring
├── Controls/
│   └── ColorWheelView.cs         # custom SkiaSharp drawable for the wheel
├── Models/
│   └── RgbColor.cs               # simple R, G, B byte struct
├── Platforms/
│   └── Android/
│       └── AndroidManifest.xml
└── Resources/
```

## Dependencies

| Package | Purpose |
|---|---|
| `SkiaSharp.Views.Maui.Controls` | Rendering the color wheel via `SKCanvasView` + touch handling |
| None (built-in) | `System.Net.Sockets.UdpClient` for sACN UDP multicast |
| None (built-in) | `Microsoft.Maui.Networking.Connectivity` for Wi-Fi detection |

No third-party sACN library — the protocol is simple enough to implement directly in `SacnService`.

## Key Implementation Notes

### Color Wheel (SkiaSharp)

- Draw a circular HSV color disc using a sweep gradient (hue) combined with a radial gradient (saturation)
- Handle `SKTouchAction.Pressed`, `Moved`, `Released` to track finger position
- Convert polar coordinates (angle → hue, distance from center → saturation) to HSV, then combine with the brightness slider value to produce RGB
- Fire a `ColorChanged` event on every touch move

### sACN Packet Structure

Total packet size: 638 bytes (126 byte header + 512 slots). Build as a `byte[]`:

| Offset | Length | Field |
|---|---|---|
| 0–11 | 12 | Preamble + post-amble + ACN packet identifier |
| 12–15 | 4 | Root flags + length |
| 16–19 | 4 | Root vector (`0x00000004`) |
| 20–35 | 16 | CID (sender UUID) |
| 36–37 | 2 | Framing flags + length |
| 38–41 | 4 | Framing vector (`0x00000002`) |
| 42–105 | 64 | Source name (UTF-8 padded) |
| 106 | 1 | Priority (100) |
| 107–108 | 2 | Sync address (0) |
| 109 | 1 | Sequence number |
| 110 | 1 | Options |
| 111–112 | 2 | Universe (1) |
| 113–114 | 2 | DMP flags + length |
| 115 | 1 | DMP vector (`0x02`) |
| 116 | 1 | Address type (`0xA1`) |
| 117–118 | 2 | First property address (0) |
| 119–120 | 2 | Address increment (1) |
| 121–122 | 2 | Property value count (513) |
| 123 | 1 | DMX start code (0) |
| 124–635 | 512 | DMX channel data (slot 1 = R, 2 = G, 3 = B) |

### Android Permissions

In `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
```

Acquire a `WifiManager.MulticastLock` on Android to ensure multicast packets are not dropped by the Wi-Fi driver. Acquire on app resume, release on pause.

### Transmission Lifecycle

- Start sending when the app enters the foreground and Wi-Fi is available
- Use a background `Task` with a `PeriodicTimer` for the send loop
- While touch is active: send at ~22 Hz
- While idle: send at ~1 Hz (keep-alive to prevent receivers from timing out)
- Stop sending when the app enters the background or Wi-Fi is lost
- On app close/background: stop sending (receivers retain last received values)

## CI/CD — GitHub Actions

### Workflow: Build & Release on Tag Push

**Trigger:** Push of a tag matching `v*` (e.g. `v1.0.0`)

**File:** `.github/workflows/build-android.yml`

```yaml
name: Build Android APK

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Install MAUI workload
        run: dotnet workload install maui-android

      - name: Setup Java JDK
        uses: actions/setup-java@v4
        with:
          distribution: 'microsoft'
          java-version: '17'

      - name: Restore dependencies
        run: dotnet restore SacnController/SacnController.csproj

      - name: Decode keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE_B64 }}" | base64 -d > ${{ github.workspace }}/keystore.jks

      - name: Publish signed APK
        run: |
          dotnet publish SacnController/SacnController.csproj \
            -f net8.0-android \
            -c Release \
            -p:AndroidKeyStore=true \
            -p:AndroidSigningKeyStore=${{ github.workspace }}/keystore.jks \
            -p:AndroidSigningKeyAlias=${{ secrets.ANDROID_KEY_ALIAS }} \
            -p:AndroidSigningKeyPass=${{ secrets.ANDROID_KEY_PASSWORD }} \
            -p:AndroidSigningStorePass=${{ secrets.ANDROID_KEYSTORE_PASSWORD }}

      - name: Find APK
        id: find_apk
        run: |
          APK_PATH=$(find . -name '*.apk' -path '*/publish/*' | head -1)
          echo "apk_path=$APK_PATH" >> $GITHUB_OUTPUT
          echo "apk_name=$(basename $APK_PATH)" >> $GITHUB_OUTPUT

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: ${{ steps.find_apk.outputs.apk_path }}
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Required Repository Secrets

| Secret | Description |
|---|---|
| `ANDROID_KEYSTORE_B64` | Base64-encoded `.jks` keystore file (`base64 -w0 keystore.jks`) |
| `ANDROID_KEY_ALIAS` | Key alias within the keystore |
| `ANDROID_KEY_PASSWORD` | Password for the key |
| `ANDROID_KEYSTORE_PASSWORD` | Password for the keystore |

### Keystore Generation (one-time)

```bash
keytool -genkeypair -v \
  -keystore sacn-controller.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias sacn-controller \
  -storepass <password> -keypass <password>

# Encode for the secret
base64 -w0 sacn-controller.jks | pbcopy
```

### Notes

- The workflow produces a signed release APK attached to a GitHub Release
- Release notes are auto-generated from commits since the previous tag
- The APK is not uploaded to Google Play — this is a sideload-only distribution for now
- If the app project path differs from `SacnController/`, update the path in the workflow accordingly

## Out of Scope (for now)

- Multiple universes or arbitrary channel mapping
- Fixture profiles / patching
- Scene saving / recall
- Discovery (receivers are pre-configured)
- iOS build target
- Settings screen
