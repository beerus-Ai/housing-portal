# Sahyadri Heights Android app (Capacitor)

Native Android wrapper around the mobile web app (`/m/`), full screen. It loads from the portal server, so the server must be running. Not tested on a physical device yet. The newer native client is the [Flutter app](../flutter_app/README.md).

## Build and install (Windows)
1. Start the server: `npm start` in the repo root (port 3000).
2. JDK 21 (Capacitor 7): set `JAVA_HOME` to `C:\Program Files\Android\Android Studio\jbr`.
3. `cd mobile && npm install`
4. Create `android/local.properties` with `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk` (not committed).
5. `cd android && gradlew.bat assembleDebug` -> `app/build/outputs/apk/debug/app-debug.apk`
6. Phone: enable USB debugging, `adb reverse tcp:3000 tcp:3000`, `adb install -r app-debug.apk`.

`capacitor.config.json` points at `http://localhost:3000/m/` (works over `adb reverse`). For Wi-Fi, set `server.url` to `http://<PC-IP>:3000/m/` and run `npx cap sync android`. For a store release, use an HTTPS server URL and a signed build.

## NFC and QR (native)
- Plugins: `@capacitor-mlkit/barcode-scanning` (camera QR) and the local `SahyadriNfc` plugin (`android/app/src/main/java/com/sahyadri/heights/SahyadriNfcPlugin.java`, NDEF read and write). `public/m/m.js` finds them via `window.Capacitor`; in a browser, NFC buttons become a hint and QR falls back to `BarcodeDetector`, then the 6-digit code.
- Resident: Gate pass > My gate QR > **Write to NFC tag**. The tag holds one NDEF text record `HSP:<token>` (same as the QR); resetting the QR invalidates old tags.
- Guard: Gate > **Tap to read** (NFC) or **Scan QR**; result ALLOWED or DENIED.
- Tags: NTAG213/215/216 and Mifare Ultralight with NDEF, unlocked. Mifare Classic mostly unsupported. Tokens are never logged.
- After changing plugins: `npx cap sync android`, then rebuild.
