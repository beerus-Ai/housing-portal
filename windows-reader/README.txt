Sahyadri Card Reader for Windows
================================

What it does
  Browsers on a PC cannot read NFC cards: Web NFC exists only in Chrome on Android phones.
  This small program reads cards for the gate desk instead. It works with a laptop's built-in
  NFC chip (Windows shows it as "Microsoft IFD 0") or a USB reader such as the ACR122U. When a
  card is tapped, it types the card number and Enter into the portal's gate desk, so tapping in
  and registering cards work on the PC. The number is the card's serial (UID) in upper-case hex,
  the same number the Android phone and the Flutter app read. One card works everywhere.

Install (no admin rights needed)
  1. Unzip SahyadriCardReader.zip into a folder.
  2. Right-click install.ps1 > Run with PowerShell
     (or: powershell -ExecutionPolicy Bypass -File install.ps1).
     Windows SmartScreen may warn that the publisher is unknown: choose More info > Run anyway.
  3. A round blue icon appears in the tray, next to the clock. It starts with Windows.

Use
  Open the portal in Chrome or Edge, sign in as the guard, and open the Gate desk.
  - Tap in / out: tap a card. The number goes into the "Card number" box and is submitted.
  - Register: click "Register a card", tap the card, then choose who carries it from the dropdown.
  By default it only types when the portal window is in front (title contains "Sahyadri" or
  "Portal"). Otherwise it shows the number in a notification and copies it to the clipboard.
  Right-click the tray icon for: pause typing, type into any window, start with Windows, exit.

Check that the reader works
  Open PowerShell in this folder and run:   .\SahyadriCardCheck.exe --read-once 30
  then hold a card on the reader. It prints "Card number: 04A1B2C3..." or what went wrong.
  "No NFC reader found": turn NFC on (Settings > Network & internet > Airplane mode > NFC),
  or plug in the USB reader.

Remove
  powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall
