# Configuring the AIRI Gateway

The AIRI Gateway supports securely connecting external clients (such as mobile applications, VS Code Extensions, and custom Python servers) using WebSockets.

## Gateway Authentication

Starting with version `0.9.0-alpha.16`, the AIRI Gateway forces an authentication handshake locally to protect your computer from unauthorized software and unauthorized network devices routing through your local network IP (LAN attacks).

### Application Gateway Key
By default, AIRI Desktop (Tamagotchi) generates a random, secure UUID known as the **Application Gateway Key** (or `authToken`).
Any client that attempts to connect to `ws://127.0.0.1:6121` must provide this token.

To find your token:
1. Open the AIRI Desktop application.
2. Click the **Settings** gear icon.
3. Access the **Connection** tab.
4. Locate the **Application Gateway Key** text field. You can securely copy this key into your client application (like the VS Code Extension).

### Hostname Binding
For maximum security, the AIRI Gateway defaults to binding directly to your local loopback address: `127.0.0.1`.
This prevents external devices on your WiFi network from contacting your AIRI server.

If you wish to allow external devices (for example, setting up the Android/iOS pocket application) to connect properly, you must:
1. Open the **Connection** tab in AIRI Settings.
2. Locate the **AIRI Gateway Hostname** text field.
3. Set the Hostname to `0.0.0.0`.
4. (Optional) Provide your Secure WebSocket keys (WSS) immediately below it if accessing over public WiFi.
