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
  <title>DMX Bridge Setup</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 400px;
      width: 100%;
      padding: 40px 30px;
    }
    h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 8px;
      text-align: center;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
      text-align: center;
      margin-bottom: 30px;
    }
    .info {
      background: #f0f4ff;
      border-left: 4px solid #667eea;
      padding: 12px;
      margin-bottom: 24px;
      border-radius: 4px;
      font-size: 13px;
      color: #555;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      color: #333;
      font-weight: 600;
      margin-bottom: 6px;
      font-size: 14px;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      font-size: 15px;
      transition: border-color 0.3s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    button:active {
      transform: translateY(0);
    }
    .hint {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎭 DMX Bridge</h1>
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

      <button type="submit">Save & Connect</button>
    </form>
  </div>
</body>
</html>
)=====";

void handleCaptivePortal() {
  String html = String(CAPTIVE_PORTAL_HTML);
  html.replace("{{VERSION}}", FIRMWARE_VERSION);
  html.replace("{{DEVICE_NAME}}", config.device_name);
  html.replace("{{MAC_ADDRESS}}", getMacAddress());

  Serial.println("[HTTP] Sending CP page");

  server.send(200, "text/html", html);
}

void handleCaptivePortalSubmit() {
  if (!server.hasArg("ssid") || !server.hasArg("password") || !server.hasArg("universe")) {
    server.send(400, "text/plain", "Missing required fields");
    return;
  }

  String ssid = server.arg("ssid");
  String password = server.arg("password");
  String universe_str = server.arg("universe");

  // Validate inputs
  if (ssid.length() == 0 || ssid.length() > 32) {
    server.send(400, "text/plain", "Invalid SSID length");
    return;
  }

  if (password.length() < 8 || password.length() > 63) {
    server.send(400, "text/plain", "Password must be 8-63 characters");
    return;
  }

  uint16_t universe = universe_str.toInt();
  if (universe < 1 || universe > 63999) {
    server.send(400, "text/plain", "Universe must be 1-63999");
    return;
  }

  // Save configuration
  config.wifi_ssid = ssid;
  config.wifi_password = password;
  config.sacn_universe = universe;
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 400px;
      width: 100%;
      padding: 40px 30px;
      text-align: center;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    h1 {
      color: #333;
      font-size: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #666;
      font-size: 15px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✅</div>
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
