import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../theme.dart';

/// What the committee picked: a vendor or a society staff member.
class AssignPick {
  const AssignPick.vendor(int id, this.name) : vendorId = id, staffId = null;
  const AssignPick.staff(int id, this.name) : staffId = id, vendorId = null;
  final int? vendorId, staffId;
  final String name;
}

/// Vendors in the order the committee most likely wants: the AI suggestion first (a suggestion
/// only; the committee decides), then vendors whose trade matches the request category, then the rest.
List<Map<String, dynamic>> orderVendors(List<dynamic> vendors, {String? category, int? suggestedId}) {
  int rank(Map<String, dynamic> v) =>
      v['id'] == suggestedId ? 0 : (v['trade'] == category ? 1 : 2);
  final list = vendors.map((v) => Map<String, dynamic>.from(v as Map)).toList();
  list.sort((a, b) {
    final r = rank(a).compareTo(rank(b));
    return r != 0 ? r : '${a['name']}'.compareTo('${b['name']}');
  });
  return list;
}

/// Staff on shift first, then fewest open jobs.
List<Map<String, dynamic>> orderStaff(List<dynamic> staff) {
  final list = staff.map((s) => Map<String, dynamic>.from(s as Map)).toList();
  list.sort((a, b) {
    final on = (b['on_shift'] == true ? 1 : 0).compareTo(a['on_shift'] == true ? 1 : 0);
    return on != 0 ? on : ((a['open_jobs'] ?? 0) as int).compareTo((b['open_jobs'] ?? 0) as int);
  });
  return list;
}

class AssignSheet extends StatefulWidget {
  const AssignSheet({super.key, required this.request});
  final Map<String, dynamic> request;
  @override
  State<AssignSheet> createState() => _AssignSheetState();
}

class _AssignSheetState extends State<AssignSheet> {
  late final Future<(List<dynamic>, List<dynamic>)> _future = _load();

  Future<(List<dynamic>, List<dynamic>)> _load() async {
    final r = await Future.wait([
      app.run((a) => a.vendors()),
      // Staff accounts are optional; a society without them still assigns vendors.
      app.run((a) => a.staff()).catchError((_) => <dynamic>[]),
    ]);
    return (r[0], r[1]);
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    final suggested = (r['ai'] is Map) ? (r['ai'] as Map)['vendor_id'] as int? : null;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        child: FutureBuilder<(List<dynamic>, List<dynamic>)>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()));
            }
            if (snap.hasError) return EmptyState(Icons.cloud_off, '${snap.error}');
            final (vendorsRaw, staffRaw) = snap.data!;
            final vendors = orderVendors(vendorsRaw, category: r['category'] as String?, suggestedId: suggested);
            final staff = orderStaff(staffRaw);
            if (vendors.isEmpty && staff.isEmpty) {
              return const EmptyState(Icons.person_off_outlined, 'No vendors or staff yet. Add them on the web dashboard.');
            }
            return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
              Text('Assign request #${r['id']}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(r['title'] ?? '', style: const TextStyle(color: Colors.black54)),
              if (vendors.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('Vendors', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                for (final v in vendors)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      backgroundColor: Palette.accent100,
                      child: Icon(catIcon(v['trade'] as String?), color: Palette.accent700),
                    ),
                    title: Text('${v['name']}'),
                    subtitle: Text([
                      catLabel(v['trade'] as String?),
                      if (v['phone'] != null) '${v['phone']}',
                    ].join(' · ')),
                    trailing: v['id'] == suggested
                        ? const Chip(label: Text('AI suggestion'), visualDensity: VisualDensity.compact)
                        : null,
                    onTap: () => Navigator.pop(context, AssignPick.vendor(v['id'] as int, '${v['name']}')),
                  ),
              ],
              if (staff.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('Society staff', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                for (final s in staff)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const CircleAvatar(
                      backgroundColor: Palette.accent100,
                      child: Icon(Icons.engineering_outlined, color: Palette.accent700),
                    ),
                    title: Text('${s['name']}'),
                    subtitle: Text('${s['on_shift'] == true ? 'On shift' : 'Off shift'} · ${s['open_jobs'] ?? 0} open jobs'),
                    onTap: () => Navigator.pop(context, AssignPick.staff(s['id'] as int, '${s['name']}')),
                  ),
              ],
            ]);
          },
        ),
      ),
    );
  }
}
