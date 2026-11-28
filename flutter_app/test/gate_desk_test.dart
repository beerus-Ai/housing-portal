import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sahyadri_heights/nfc_serial.dart';
import 'package:sahyadri_heights/screens/gate_desk.dart';
import 'package:sahyadri_heights/theme.dart';

void main() {
  test('card numbers match the server and Web NFC (upper-case hex, no separators)', () {
    expect(normSerial('04:a1:b2:c3'), '04A1B2C3');
    expect(normSerial(' 04-a1 b2.c3 '), '04A1B2C3');
    expect(normSerial('04:ZZ'), ''); // not hex: invalid, never a near match
    expect(hexOf([4, 161, 178, 195]), '04A1B2C3');
  });

  test('serial comes from the tag identifier on Android and iOS', () {
    expect(serialFromTagData({'ndef': {'identifier': [1, 2]}, 'nfca': {'identifier': [4, 161, 178, 195], 'atqa': [0, 68]}}), '04A1B2C3');
    expect(serialFromTagData({'mifare': {'identifier': [0xde, 0xad, 0xbe, 0xef]}}), 'DEADBEEF');
    expect(serialFromTagData({'nfca': {'atqa': [0]}}), '');
  });

  test('people rows use the web wording', () {
    expect(personSub({'role': 'resident', 'flat': 'A-101'}), 'Flat A-101');
    expect(personSub({'role': 'staff', 'department': 'cleaning'}), 'Cleaning staff');
    expect(personSub({'role': 'staff', 'department': 'maintenance'}), 'Maintenance staff');
    expect(personSub({'role': 'shop'}), 'Tuck shop');
  });

  testWidgets('register: full-screen scanner, then the card number and a "who carries it" dropdown', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: const GateDeskScreen(nfc: false)));
    await tester.pump();
    await tester.tap(find.text('Register a card'));
    await tester.pump();
    expect(find.text('Tap the new card'), findsOneWidget);
    expect(find.text('Latest taps'), findsNothing); // the scanner covers the whole screen
    final s = tester.state<GateDeskState>(find.byType(GateDeskScreen));
    await s.handleSerial('04:a1:b2:c3'); // what the NFC reader passes in
    await tester.pump();
    expect(find.text('Card detected'), findsOneWidget);
    expect(find.text('04A1B2C3'), findsOneWidget);
    expect(find.text('Who carries this card?'), findsOneWidget);
  });
}
