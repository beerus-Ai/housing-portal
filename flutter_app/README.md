# Sahyadri Heights: Flutter app

A Flutter (Dart) mobile client for the existing portal API. It uses the same URLs, session cookie and rules as the web app, so no server change was needed. The architecture is in `docs/architecture/product-and-technology-architecture.md`.

## Run

```bash
flutter pub get
flutter test                 # API client and widget tests
flutter run                  # on a connected phone or emulator
flutter build apk --release  # build/app/outputs/flutter-apk/app-release.apk
```

- By default the app talks to the live server `https://sahyadri-heights.onrender.com`. On the sign-in screen, tap **Server settings** to change it.
- To use a local server on a USB phone, run `node server.js` on port 3000, then `adb reverse tcp:3000 tcp:3000`, and use `http://localhost:3000` (cleartext is allowed for local testing).
- On the Android emulator, use `http://10.0.2.2:3000`.

## Layout

- `lib/api.dart`: the REST client (login keeps the `connect.sid` cookie; multipart request with photo).
- `lib/app_state.dart`: the signed-in user and stored session; a 401 signs the app out.
- `lib/theme.dart`: the palette from `public/css/tokens.css`, categories and status labels.
- `lib/screens/`: shell (bottom nav by role), login, home, requests, new_request, request_detail, notices, emergency, gate_pass, profile.
