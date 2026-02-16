/*
 * Captive Portal HTML Interface
 * Served in AP mode for initial configuration
 */

const char CAPTIVE_PORTAL_HTML[] PROGMEM = R"=====(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ThorDMX Setup</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #111827;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 12px;
      max-width: 400px;
      width: 100%;
      padding: 40px 30px;
    }
    .logo {
      text-align: center;
      margin-bottom: 8px;
    }
    .logo svg {
      width: 48px;
      height: 48px;
    }
    h1 {
      color: #f3f4f6;
      font-size: 24px;
      margin-bottom: 4px;
      text-align: center;
      font-weight: 600;
    }
    h1 span {
      color: #7c3aed;
    }
    .subtitle {
      color: #9ca3af;
      font-size: 14px;
      text-align: center;
      margin-bottom: 28px;
    }
    .info {
      background: #111827;
      border-left: 4px solid #481780;
      padding: 12px;
      margin-bottom: 24px;
      border-radius: 4px;
      font-size: 13px;
      color: #9ca3af;
    }
    .info strong {
      color: #d1d5db;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      color: #d1d5db;
      font-weight: 600;
      margin-bottom: 6px;
      font-size: 14px;
    }
    input {
      width: 100%;
      padding: 12px;
      background: #111827;
      border: 2px solid #374151;
      border-radius: 8px;
      font-size: 15px;
      color: #f3f4f6;
      transition: border-color 0.3s;
    }
    input::placeholder {
      color: #6b7280;
    }
    input:focus {
      outline: none;
      border-color: #481780;
    }
    button {
      width: 100%;
      padding: 14px;
      background: #481780;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 4px;
    }
    button:hover {
      background: #5b21b6;
    }
    button:active {
      background: #3b0f6b;
    }
    .hint {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" stroke="#481780" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
    </div>
    <h1><span>Thor</span>DMX Bridge</h1>
    <div class="subtitle">Firmware v{{VERSION}}</div>

    <div class="info">
      <strong>Device:</strong> {{DEVICE_NAME}}<br>
      <strong>MAC:</strong> {{MAC_ADDRESS}}
    </div>

    <form action="/configure" method="POST">
      <div class="form-group">
        <label for="ssid">WiFi Network</label>
        <input type="text" id="ssid" name="ssid" required maxlength="32" placeholder="Network name">
      </div>

      <div class="form-group">
        <label for="password">WiFi Password</label>
        <input type="password" id="password" name="password" required minlength="8" maxlength="63" placeholder="Password">
        <div class="hint">Minimum 8 characters</div>
      </div>

      <div class="form-group">
        <label for="universe">sACN Universe</label>
        <input type="number" id="universe" name="universe" value="1" min="1" max="63999" required>
        <div class="hint">Range: 1-63999</div>
      </div>

      <div class="form-group">
        <label for="start_channel">DMX Start Channel</label>
        <input type="number" id="start_channel" name="start_channel" value="1" min="1" max="512" required>
        <div class="hint">Offset into the universe (1 = no offset)</div>
      </div>

      <button type="submit">Save & Connect</button>
    </form>
  </div>
</body>
</html>
)=====";

void handleCaptivePortal()
{
  String html = String(CAPTIVE_PORTAL_HTML);
  html.replace("{{VERSION}}", FIRMWARE_VERSION);
  html.replace("{{DEVICE_NAME}}", config.device_name);
  html.replace("{{MAC_ADDRESS}}", getMacAddress());

  server.send(200, "text/html", html);
}

void handleCaptivePortalSubmit()
{
  if (!server.hasArg("ssid") || !server.hasArg("password") || !server.hasArg("universe") || !server.hasArg("start_channel"))
  {
    server.send(400, "text/plain", "Missing required fields");
    return;
  }

  String ssid = server.arg("ssid");
  String password = server.arg("password");
  String universe_str = server.arg("universe");
  String start_channel_str = server.arg("start_channel");

  // Validate inputs
  if (ssid.length() == 0 || ssid.length() > 32)
  {
    server.send(400, "text/plain", "Invalid SSID length");
    return;
  }

  if (password.length() < 8 || password.length() > 63)
  {
    server.send(400, "text/plain", "Password must be 8-63 characters");
    return;
  }

  uint16_t universe = universe_str.toInt();
  if (universe < 1 || universe > 63999)
  {
    server.send(400, "text/plain", "Universe must be 1-63999");
    return;
  }

  uint16_t start_channel = start_channel_str.toInt();
  if (start_channel < 1 || start_channel > 512)
  {
    server.send(400, "text/plain", "DMX start channel must be 1-512");
    return;
  }

  // Save configuration
  config.wifi_ssid = ssid;
  config.wifi_password = password;
  config.sacn_universe = universe;
  config.dmx_start_channel = start_channel;
  saveConfig();

  // Send success page
  String success_html = R"=====(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Configuration Saved</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #111827;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 12px;
      max-width: 400px;
      width: 100%;
      padding: 40px 30px;
      text-align: center;
    }
    .success-icon {
      margin-bottom: 20px;
    }
    .success-icon svg {
      width: 48px;
      height: 48px;
    }
    h1 {
      color: #f3f4f6;
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #9ca3af;
      font-size: 15px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="#22c55e" stroke-width="2"/>
        <path d="M8 12l3 3 5-5" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1>Configuration Saved</h1>
    <p>The device will now restart and connect to your network.</p>
  </div>
</body>
</html>
)=====";

  server.send(200, "text/html", success_html);

  Serial.println("[Config] Settings saved via captive portal, rebooting...");
  delay(2000);
  ESP.restart();
}
