import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../modules_util.dart';
import '../theme.dart';
import 'request_detail.dart';

const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/// Everyone sees the weekly pickups. Residents report a missed pickup (it becomes a housekeeping
/// request); staff and the committee log collections. The schedule itself is edited on the web.
class WasteScreen extends StatefulWidget {
  const WasteScreen({super.key});
  @override
  State<WasteScreen> createState() => _WasteScreenState();
}

class _WasteScreenState extends State<WasteScreen> {
  bool get _team => app.isAdmin || app.role == 'staff';
  late Future<(List<dynamic>, Map<String, dynamic>?)> _future = _load();

  Future<(List<dynamic>, Map<String, dynamic>?)> _load() async {
    final s = await app.run((a) => a.wasteSchedule());
    final l = _team ? await app.run((a) => a.wasteLogs(days: 30)) : null;
    return (s, l);
  }

  Future<void> _refresh() async {
    final f = _load();
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) {
    final todayWd = DateTime.parse(istToday()).weekday - 1;
    return Scaffold(
      appBar: AppBar(title: Text(app.isResident ? 'Waste collection' : 'Waste')),
      floatingActionButton: app.isResident || _team
          ? FloatingActionButton.extended(
              icon: Icon(app.isResident ? Icons.local_shipping_outlined : Icons.scale_outlined),
              label: Text(app.isResident ? 'Pickup missed?' : 'Log collection'),
              onPressed: () async {
                final r = await showModalBottomSheet<Object>(
                    context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => _WasteSheet(missed: app.isResident));
                if (r is int && context.mounted) {
                  await Navigator.push(context, MaterialPageRoute(builder: (_) => RequestDetailScreen(id: r)));
                }
                if (r != null) _refresh();
              },
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<(List<dynamic>, Map<String, dynamic>?)>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (snap.hasError) return ListView(children: [EmptyState(Icons.cloud_off, '${snap.error}')]);
            final (sched, logs) = snap.data!;
            return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), children: [
              const Text('Keep bins out before the pickup time. Separate wet, dry and recyclable waste.', style: TextStyle(color: Colors.black54)),
              const SizedBox(height: 12),
              for (var wd = 0; wd < 7; wd++)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16), side: wd == todayWd ? const BorderSide(color: Palette.accent, width: 1.5) : BorderSide.none),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${_weekdays[wd]}${wd == todayWd ? ' · today' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      ...(() {
                        final items = sched.where((s) => s['weekday'] == wd).toList();
                        if (items.isEmpty) return [const Text('No pickup', style: TextStyle(color: Colors.black45))];
                        return [
                          for (final s in items)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(children: [
                                Icon(wasteIcon(s['kind'] as String?), size: 20, color: Palette.accent700),
                                const SizedBox(width: 8),
                                Expanded(child: Text('${wasteLabel(s['kind'] as String?)} · ${s['time']}${s['note'] != null ? ' · ${s['note']}' : ''}')),
                              ]),
                            ),
                        ];
                      })(),
                    ]),
                  ),
                ),
              if (logs != null) ...[
                const SizedBox(height: 12),
                const Text('Last 30 days', style: sectionStyle),
                const SizedBox(height: 8),
                statGrid([
                  StatTile(icon: Icons.delete_outline, value: '${(logs['totals'] as Map)['total']} kg', label: 'Collected'),
                  StatTile(
                      icon: Icons.recycling,
                      value: (logs['totals'] as Map)['segregated_pct'] == null ? '–' : '${(logs['totals'] as Map)['segregated_pct']}%',
                      label: 'Segregated'),
                ]),
                const SizedBox(height: 8),
                for (final l in (logs['logs'] as List).take(20))
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(wasteIcon(l['kind'] as String?), color: Palette.accent700),
                    title: Text('${wasteLabel(l['kind'] as String?)} · ${l['weight_kg']} kg'),
                    subtitle: Text('${dayLabel(l['date'] as String)} · ${l['by_name']}${l['note'] != null ? ' · ${l['note']}' : ''}'),
                  ),
              ],
            ]);
          },
        ),
      ),
    );
  }
}

/// Resident: report a missed pickup (returns the new request id). Staff/committee: log a collection (returns true).
class _WasteSheet extends StatefulWidget {
  const _WasteSheet({required this.missed});
  final bool missed;
  @override
  State<_WasteSheet> createState() => _WasteSheetState();
}

class _WasteSheetState extends State<_WasteSheet> {
  String _kind = 'dry';
  final _kg = TextEditingController();
  final _note = TextEditingController();
  bool _busy = false;

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      if (widget.missed) {
        final id = await app.run((a) => a.reportMissedPickup(_kind, note: _note.text.trim()));
        if (!mounted) return;
        toast(context, 'Reported as request #$id. The committee has been told.');
        Navigator.pop(context, id);
      } else {
        final kg = num.tryParse(_kg.text.trim());
        if (kg == null || kg <= 0) {
          toast(context, 'Enter the weight in kg', error: true);
          setState(() => _busy = false);
          return;
        }
        await app.run((a) => a.logWaste(_kind, kg, note: _note.text.trim()));
        if (!mounted) return;
        toast(context, 'Collection saved');
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(widget.missed ? 'Pickup missed?' : 'Log a collection (today)', style: sectionStyle),
          if (widget.missed) const Text('It becomes a housekeeping request you can follow.', style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: wasteKinds.any((k) => k.$1 == _kind) ? _kind : null,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Kind of waste'),
            items: [
              for (final k in wasteKinds)
                DropdownMenuItem<String>(
                  value: k.$1,
                  child: Row(children: [Icon(k.$3, size: 18), const SizedBox(width: 10), Text(k.$2)]),
                ),
            ],
            onChanged: (v) {
              if (v != null) setState(() => _kind = v);
            },
          ),
          const SizedBox(height: 12),
          if (!widget.missed) ...[
            TextField(controller: _kg, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Weight (kg)')),
            const SizedBox(height: 12),
          ],
          TextField(controller: _note, maxLength: widget.missed ? 300 : 200, decoration: InputDecoration(labelText: widget.missed ? 'Details (optional)' : 'Note (optional)')),
          FilledButton(onPressed: _busy ? null : _save, child: Text(widget.missed ? 'Report missed pickup' : 'Save')),
        ]),
      );
}
