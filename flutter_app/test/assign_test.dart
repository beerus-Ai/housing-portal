import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sahyadri_heights/screens/assign_sheet.dart';
import 'package:sahyadri_heights/screens/login.dart';
import 'package:sahyadri_heights/theme.dart';

void main() {
  test('vendors: AI suggestion first, then matching trade, then the rest by name', () {
    final v = [
      {'id': 1, 'name': 'Zed Electric', 'trade': 'electrical'},
      {'id': 2, 'name': 'Aqua Fix', 'trade': 'plumbing'},
      {'id': 3, 'name': 'Bright Plumbers', 'trade': 'plumbing'},
      {'id': 4, 'name': 'Any Works', 'trade': 'other'},
    ];
    expect(orderVendors(v, category: 'plumbing', suggestedId: 3).map((x) => x['id']), [3, 2, 4, 1]);
    expect(orderVendors(v, category: 'lift').map((x) => x['id']), [4, 2, 3, 1]);
  });

  test('staff: on shift first, then fewest open jobs', () {
    final s = [
      {'id': 1, 'on_shift': false, 'open_jobs': 0},
      {'id': 2, 'on_shift': true, 'open_jobs': 4},
      {'id': 3, 'on_shift': true, 'open_jobs': 1},
    ];
    expect(orderStaff(s).map((x) => x['id']), [3, 2, 1]);
  });

  test('error colour is neutral; red is kept for emergencies', () {
    expect(buildTheme().colorScheme.error, Palette.errorText);
    expect(Palette.errorText, isNot(Palette.emRed));
  });

  testWidgets('login error text is not red', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: const LoginScreen()));
    await tester.tap(find.byKey(const Key('signin')));
    await tester.pump();
    final t = tester.widget<Text>(find.text('Enter your email and password'));
    expect(t.style?.color, Palette.errorText);
  });

  testWidgets('error toast uses the neutral background with an info icon', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: Scaffold(body: Builder(builder: (c) => TextButton(onPressed: () => toast(c, 'Nope', error: true), child: const Text('go')))),
    ));
    await tester.tap(find.text('go'));
    await tester.pump();
    final bar = tester.widget<SnackBar>(find.byType(SnackBar));
    expect(bar.backgroundColor, Palette.text);
    expect(find.byIcon(Icons.info_outline), findsOneWidget);
  });
}
