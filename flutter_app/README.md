# Sahyadri Heights: Flutter app

Flutter 3.50 / Dart 3.14 client for the portal API. It uses the same URLs, session cookie and rules as the web app; no server change was needed. Architecture: [product and technology architecture](../docs/architecture/product-and-technology-architecture.md).

## Run
```bash
flutter pub get
flutter test                 # 18 tests: API client, assign, modules, IST dates, rupees, menus, error colour, login
flutter run                  # phone or emulator
flutter build apk --release  # build/app/outputs/flutter-apk/app-release.apk
```
- Default server: `https://sahyadri-heights.onrender.com`. Change it under **Server settings** on the sign-in screen.
- Local server: emulator `http://10.0.2.2:3000`; USB phone `adb reverse tcp:3000 tcp:3000`, then `http://localhost:3000`.

## What it does
- Bottom navigation by role: residents (Home, Requests, Services, Gate pass, Profile), committee (Home, Requests, Services, Profile), staff (Home, My jobs, Services, Profile), guard and IT (Home, Profile).
- Services: amenities (book, cancel), maintenance dues (residents see their flat; committee raises bills and records payments), inventory (committee and staff), waste (schedule; residents report a missed pickup; staff and committee log collections), notices. Home shows a "Society services" row. Setting up amenities and the waste schedule stays on the web.
- Screens: sign in, home, requests, new request with photo, request detail (tracker, messages, history; committee assigns a vendor or staff, then moves it to the next stage), notices, SOS, gate QR, profile.

## Layout
- `lib/api.dart`: REST client (keeps the `connect.sid` cookie; multipart photo upload).
- `lib/app_state.dart`: signed-in user and stored session; a 401 signs out.
- `lib/theme.dart`: palette from `public/css/tokens.css`, categories and status labels.
- `lib/screens/`: one file per screen; `shell.dart` holds the role-based navigation.

## Status
Checked on an Android emulator against a local server. Not verified: physical phone, iOS, the live server.

Errors are neutral (red only for emergencies). Open: physical phone, iOS and live-server check. Jira: HSP-68, HSP-69 (done), HSP-70.
