import 'package:material_ui/material_ui.dart';

import 'theme.dart';

/// The society is in India: bookings and due dates use IST, like the server.
String istToday([DateTime? now]) {
  final d = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 5, minutes: 30));
  return ymd(d);
}

String ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String addDays(String date, int n) => ymd(DateTime.utc(
    int.parse(date.substring(0, 4)), int.parse(date.substring(5, 7)), int.parse(date.substring(8, 10)) + n));

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// 2026-11-26 -> "Thu 26 Nov".
String dayLabel(String date) {
  final d = DateTime.utc(int.parse(date.substring(0, 4)), int.parse(date.substring(5, 7)), int.parse(date.substring(8, 10)));
  return '${_days[d.weekday - 1]} ${d.day} ${_months[d.month - 1]}';
}

/// Indian grouping: 125000 -> ₹1,25,000; decimals kept only when present.
String rupees(num? n) {
  if (n == null) return '₹0';
  final neg = n < 0;
  final whole = n.abs().truncate();
  final frac = ((n.abs() - whole) * 100).round();
  final s = whole.toString();
  String out;
  if (s.length <= 3) {
    out = s;
  } else {
    final last3 = s.substring(s.length - 3);
    var rest = s.substring(0, s.length - 3);
    final parts = <String>[];
    while (rest.length > 2) {
      parts.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) parts.insert(0, rest);
    out = '${parts.join(',')},$last3';
  }
  return '${neg ? '-' : ''}₹$out${frac > 0 ? '.${frac.toString().padLeft(2, '0')}' : ''}';
}

const wasteKinds = <(String, String, IconData)>[
  ('wet', 'Wet (kitchen)', Icons.eco_outlined),
  ('dry', 'Dry (mixed)', Icons.delete_outline),
  ('recyclable', 'Recyclable', Icons.recycling),
  ('hazardous', 'Hazardous', Icons.warning_amber_outlined),
  ('e-waste', 'E-waste', Icons.devices_other_outlined),
];
String wasteLabel(String? k) => wasteKinds.firstWhere((w) => w.$1 == k, orElse: () => (k ?? '', k ?? '', Icons.delete_outline)).$2;
IconData wasteIcon(String? k) => wasteKinds.firstWhere((w) => w.$1 == k, orElse: () => ('', '', Icons.delete_outline)).$3;

String dueStatusLabel(String? s) => switch (s) {
      'paid' => 'Paid',
      'partial' => 'Part paid',
      'unpaid' => 'Unpaid',
      'overdue' => 'Overdue',
      _ => s ?? '',
    };

/// Overdue uses the badge pink (never red: red is for emergencies).
Widget dueChip(String? status) {
  final (bg, fg) = switch (status) {
    'overdue' => (const Color(0xFFFCE4EF), Palette.badge),
    'paid' => (Palette.bg, Palette.accent700),
    _ => (Palette.accent100, Palette.accent700),
  };
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
    child: Text(dueStatusLabel(status), style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 13)),
  );
}

/// Solid stat card used on the module screens and the home "Society services" row.
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.icon, required this.value, required this.label, this.sub, this.onTap});
  final IconData icon;
  final String value, label;
  final String? sub;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            // Compact: icon beside the number, so phone cards stay small.
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, color: Palette.accent700, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.black54, fontSize: 13)),
                  if (sub != null) Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.black45, fontSize: 12)),
                ]),
              ),
            ]),
          ),
        ),
      );
}

/// Two stat tiles per row.
Widget statGrid(List<Widget> tiles) => LayoutBuilder(builder: (context, c) {
      final w = (c.maxWidth - 12) / 2;
      return Wrap(spacing: 12, runSpacing: 12, children: [for (final t in tiles) SizedBox(width: w, child: t)]);
    });

const sectionStyle = TextStyle(fontSize: 18, fontWeight: FontWeight.w700);
