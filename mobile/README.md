# Sahyadri Heights Android app (Capacitor)

A native Android wrapper around the mobile web app (`/m/`). It opens full screen with no browser bars. The app loads from the portal server, so the server must be running.

## Build and install (Windows)
1. Start the server: `npm start` in the repo root (port 3000).
2. Needs JDK 21 (Capacitor 7). Android Studio ships one: set `JAVA_HOME` to `C:\Program Files\Android\Android Studio\jbr`.
3. `cd mobile && npm install`
4. Create `android/local.properties` with `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk` (not committed).
5. `cd android && gradlew.bat assembleDebug` -> `app/build/outputs/apk/debug/app-debug.apk`
6. Phone: enable USB debugging, then `adb reverse tcp:3000 tcp:3000` and `adb install -r app-debug.apk`.

`capacitor.config.json` points the app at `http://localhost:3000/m/`, which works over the USB `adb reverse` tunnel. To use Wi-Fi instead, change `server.url` to `http://<PC-IP>:3000/m/` and run `npx cap sync android`. For a store release, host the server over HTTPS, set that URL, and build a signed release.
