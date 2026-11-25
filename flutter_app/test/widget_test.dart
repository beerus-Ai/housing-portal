import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahyadri_heights/screens/login.dart';
import 'package:sahyadri_heights/theme.dart';

void main() {
  testWidgets('login asks for email and password before calling the server', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: const LoginScreen()));
    expect(find.text('Sahyadri Heights'), findsOneWidget);
    await tester.tap(find.byKey(const Key('signin')));
    await tester.pump();
    expect(find.text('Enter your email and password'), findsOneWidget);
  });

  test('dates from SQLite are read as UTC', () {
    final d = parseDate('2026-11-25 06:30:00')!;
    expect(d.toUtc().hour, 6);
    expect(statusLabel('in_progress'), 'In progress');
    expect(catLabel('lift'), 'Lift');
  });
}
