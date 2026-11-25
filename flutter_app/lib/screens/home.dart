import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../app_state.dart';
import '../theme.dart';
import 'emergency.dart';
import 'new_request.dart';
import 'request_detail.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeData {
  List<dynamic> requests = const [], emergencies = const [], notices = const [], notifications = const [];
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<_HomeData> _future = _load();

  // Each section is optional: a role or a switched-off feature returns 403, and the card is simply left out.
  Future<List<dynamic>> _try(Future<List<dynamic>> Function(Api a) f) async {
    try {
      return await app.run(f);
    } on ApiException catch (e) {
      if (e.status == 401) rethrow;
      return const [];
    }
  }

  Future<_HomeData> _load() async {
    final role = app.role;
    final d = _HomeData();
    final r = await Future.wait([
      role == 'resident' || role == 'admin' || role == 'staff' ? _try((a) => a.requests()) : Future.value(const []),
      role == 'resident' || role == 'admin' ? _try((a) => a.emergencies()) : Future.value(const []),
      role == 'resident' || role == 'admin' ? _try((a) => a.notices()) : Future.value(const []),
      _try((a) => a.notifications()),
    ]);
    d
      ..requests = r[0]
      ..emergencies = r[1]
      ..notices = r[2]
      ..notifications = r[3];
    return d;
  }

  Future<void> _refresh() async {
    final f = _load();
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) {
    final u = app.user!;
    final first = (u['name'] as String? ?? '').split(' ').first;
    return Scaffold(
      appBar: AppBar(title: Text('Hello, $first')),
      floatingActionButton: app.isResident && app.can('emergency.raise')
          ? FloatingActionButton.extended(
              backgroundColor: Palette.emRed,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.sos),
              label: const Text('Emergency'),
              onPressed: () async {
                final raised = await Navigator.push<bool>(
                    context, MaterialPageRoute(builder: (_) => const EmergencyScreen()));
                if (raised == true) _refresh();
              },
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<_HomeData>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return ListView(children: [EmptyState(Icons.cloud_off, '${snap.error}\nPull down to retry.')]);
            }
            final d = snap.data!;
            final open = d.requests.where((r) => r['status'] != 'closed').toList();
            final active = d.emergencies.where((e) => e['status'] == 'active').toList();
            final unread = d.notifications.where((n) => n['is_read'] == 0).length;
            return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), children: [
              Text(
                [if (u['flat'] != null) 'Flat ${u['flat']}', _roleLabel(u)].join(' · '),
                style: const TextStyle(fontSize: 15, color: Colors.black54),
              ),
              const SizedBox(height: 16),
              for (final e in active) ...[_emergencyCard(e), const SizedBox(height: 12)],
              Row(children: [
                if (app.role != 'guard' && app.role != 'it')
                  Expanded(child: _stat('Open requests', open.length, Icons.build_outlined)),
                if (app.role != 'guard' && app.role != 'it') const SizedBox(width: 12),
                Expanded(child: _stat('Unread alerts', unread, Icons.notifications_none, badge: unread > 0)),
              ]),
              if (app.isResident && app.can('request.create')) ...[
                const SizedBox(height: 20),
                const Text('Raise a request', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1.35,
                  children: [
                    for (final c in categories)
                      Card(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: () async {
                            final id = await Navigator.push<int>(context,
                                MaterialPageRoute(builder: (_) => NewRequestScreen(category: c.$1)));
                            if (id != null) _refresh();
                          },
                          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                            Icon(c.$3, color: Palette.accent700, size: 26),
                            const SizedBox(height: 4),
                            Text(c.$2, style: const TextStyle(fontWeight: FontWeight.w600)),
                          ]),
                        ),
                      ),
                  ],
                ),
              ],
              if (open.isNotEmpty) ...[
                const SizedBox(height: 20),
                const Text('In progress', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                for (final r in open.take(3)) ...[
                  Card(
                    child: ListTile(
                      leading: Icon(catIcon(r['category']), color: Palette.accent700),
                      title: Text(r['title'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text('#${r['id']} · ${shortDate(r['created_at'])}'),
                      trailing: StatusChip(r['status']),
                      onTap: () => Navigator.push(context,
                              MaterialPageRoute(builder: (_) => RequestDetailScreen(id: r['id'] as int)))
                          .then((_) => _refresh()),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
              if (d.notices.isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text('Latest notice', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(d.notices.first['title'] ?? '', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      Text(d.notices.first['body'] ?? '', maxLines: 4, overflow: TextOverflow.ellipsis),
                    ]),
                  ),
                ),
              ],
              if (d.notifications.isNotEmpty) ...[
                const SizedBox(height: 20),
                const Text('Alerts', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                Card(
                  child: Column(children: [
                    for (final n in d.notifications.take(5))
                      ListTile(
                        dense: true,
                        leading: Icon(n['is_read'] == 0 ? Icons.circle : Icons.circle_outlined,
                            size: 10, color: n['is_read'] == 0 ? Palette.badge : Colors.black26),
                        title: Text(n['message'] ?? ''),
                        subtitle: Text(shortDate(n['created_at'])),
                      ),
                  ]),
                ),
                if (unread > 0)
                  TextButton(
                    onPressed: () async {
                      await app.run((a) => a.markNotificationsRead());
                      _refresh();
                    },
                    child: const Text('Mark all as read'),
                  ),
              ],
            ]);
          },
        ),
      ),
    );
  }

  String _roleLabel(Map<String, dynamic> u) => switch (u['role']) {
        'admin' => switch (u['position']) { 'head' => 'Head of committee', 'member' => 'Committee member', _ => 'Committee admin' },
        'resident' => switch (u['resident_type']) { 'owner' => 'Owner', 'tenant' => 'Tenant', _ => 'Family member' },
        'guard' => 'Security guard',
        'staff' => 'Staff',
        'it' => 'IT support',
        _ => '',
      };

  Widget _stat(String label, int n, IconData icon, {bool badge = false}) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Icon(icon, color: Palette.accent700, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('$n',
                    style: TextStyle(
                        fontSize: 26, fontWeight: FontWeight.w800, color: badge ? Palette.badge : Palette.text)),
                Text(label, style: const TextStyle(color: Colors.black54)),
              ]),
            ),
          ]),
        ),
      );

  Widget _emergencyCard(dynamic e) => Card(
        color: Palette.emRedBg,
        child: ListTile(
          leading: const Icon(Icons.warning_amber_rounded, color: Palette.emRed, size: 32),
          title: Text('Active emergency: ${e['type']}',
              style: const TextStyle(color: Palette.emRed, fontWeight: FontWeight.w700)),
          subtitle: Text('Flat ${e['flat'] ?? '-'} · ${shortDate(e['created_at'])}${e['note'] != null ? '\n${e['note']}' : ''}'),
        ),
      );
}
