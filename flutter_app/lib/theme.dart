import 'package:material_ui/material_ui.dart';

/// One palette, taken from the web portal (`public/css/tokens.css`).
/// Solid cards only; red is reserved for emergencies, pink for badges.
class Palette {
  static const accent = Color(0xFF0088B0);
  static const accent100 = Color(0xFFE9F8FF);
  static const accent700 = Color(0xFF006786);
  static const badge = Color(0xFFD82071);
  static const bg = Color(0xFFF3F2F2);
  static const surface = Color(0xFFFFFFFF);
  static const text = Color(0xFF201E1D);
  /// Emergencies only (SOS button, active-emergency card).
  static const emRed = Color(0xFFB3261E);
  static const emRedBg = Color(0xFFFDECEA);
  /// Errors and validation: neutral, never red (red means an emergency).
  static const errorText = Color(0xFF4A4544);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Palette.accent,
    primary: Palette.accent,
    surface: Palette.surface,
    error: Palette.errorText,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Palette.bg,
    appBarTheme: const AppBarTheme(
      backgroundColor: Palette.bg,
      foregroundColor: Palette.text,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
          fontSize: 22, fontWeight: FontWeight.w700, color: Palette.text),
    ),
    cardTheme: CardThemeData(
      color: Palette.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Palette.surface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Palette.surface,
      indicatorColor: Palette.accent100,
    ),
  );
}

const categories = <(String, String, IconData)>[
  ('plumbing', 'Plumbing', Icons.water_drop_outlined),
  ('electrical', 'Electrical', Icons.bolt_outlined),
  ('lift', 'Lift', Icons.elevator_outlined),
  ('housekeeping', 'Housekeeping', Icons.cleaning_services_outlined),
  ('security', 'Security', Icons.shield_outlined),
  ('other', 'Other', Icons.more_horiz),
];

String catLabel(String? k) =>
    categories.firstWhere((c) => c.$1 == k, orElse: () => (k ?? '', k ?? '', Icons.build)).$2;
IconData catIcon(String? k) =>
    categories.firstWhere((c) => c.$1 == k, orElse: () => ('', '', Icons.build_outlined)).$3;

const statusOrder = ['open', 'assigned', 'in_progress', 'closed'];
String statusLabel(String? s) => switch (s) {
      'open' => 'Open',
      'assigned' => 'Assigned',
      'in_progress' => 'In progress',
      'closed' => 'Resolved',
      _ => s ?? '',
    };

/// SQLite sends UTC as 'YYYY-MM-DD HH:MM:SS'.
DateTime? parseDate(String? s) =>
    s == null ? null : DateTime.tryParse('${s.replaceFirst(' ', 'T')}Z')?.toLocal();

const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
String shortDate(String? s) {
  final d = parseDate(s);
  if (d == null) return '';
  final hm = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  return '${d.day} ${_mon[d.month - 1]}, $hm';
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String? status;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
            color: status == 'closed' ? Palette.bg : Palette.accent100,
            borderRadius: BorderRadius.circular(999)),
        child: Text(statusLabel(status),
            style: const TextStyle(
                color: Palette.accent700, fontWeight: FontWeight.w600, fontSize: 13)),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.icon, this.text, {super.key});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(48),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 56, color: Palette.accent),
          const SizedBox(height: 12),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 16)),
        ]),
      );
}

void toast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    // Errors look like any other message plus an info icon; the colour stays neutral.
    content: Row(children: [
      if (error) ...[const Icon(Icons.info_outline, color: Colors.white, size: 20), const SizedBox(width: 10)],
      Expanded(child: Text(msg)),
    ]),
    backgroundColor: Palette.text,
    behavior: SnackBarBehavior.floating,
  ));
}
