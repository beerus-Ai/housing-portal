import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../theme.dart';
import 'new_request.dart';
import 'request_detail.dart';

/// Residents see their flat's requests, the committee sees all, staff see their jobs.
class RequestsScreen extends StatefulWidget {
  const RequestsScreen({super.key});
  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends State<RequestsScreen> {
  String? _status;
  late Future<List<dynamic>> _future = _load();

  Future<List<dynamic>> _load() => app.run((a) => a.requests(status: _status));

  Future<void> _refresh() async {
    final f = _load();
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(app.role == 'staff' ? 'My jobs' : 'Requests')),
        floatingActionButton: app.isResident && app.can('request.create')
            ? FloatingActionButton.extended(
                icon: const Icon(Icons.add),
                label: const Text('New request'),
                onPressed: () async {
                  final id = await Navigator.push<int>(
                      context, MaterialPageRoute(builder: (_) => const NewRequestScreen()));
                  if (id != null) _refresh();
                },
              )
            : null,
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: DropdownButtonFormField<String>(
              initialValue: _status ?? '',
              decoration: const InputDecoration(labelText: 'Status', prefixIcon: Icon(Icons.filter_list)),
              items: [
                for (final s in ['', ...statusOrder])
                  DropdownMenuItem<String>(value: s, child: Text(s.isEmpty ? 'All' : statusLabel(s))),
              ],
              onChanged: (v) {
                final next = (v == null || v.isEmpty) ? null : v;
                if (next == _status) return;
                _status = next;
                _refresh();
              },
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refresh,
              child: FutureBuilder<List<dynamic>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snap.hasError) {
                    return ListView(children: [EmptyState(Icons.cloud_off, '${snap.error}')]);
                  }
                  final list = snap.data!;
                  if (list.isEmpty) {
                    return ListView(children: const [EmptyState(Icons.inbox_outlined, 'No requests here')]);
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                    itemCount: list.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      final r = list[i];
                      final urgent = app.isAdmin && r['ai']?['priority'] == 'urgent';
                      return Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                          leading: CircleAvatar(
                            backgroundColor: Palette.accent100,
                            child: Icon(catIcon(r['category']), color: Palette.accent700),
                          ),
                          title: Text(r['title'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text([
                            '#${r['id']}',
                            if (app.isAdmin && r['flat'] != null) 'Flat ${r['flat']}',
                            if (r['source'] != null && r['source'] != 'app') 'via ${r['source']}',
                            if (urgent) 'AI: urgent',
                            shortDate(r['created_at']),
                          ].join(' · ')),
                          trailing: StatusChip(r['status']),
                          onTap: () => Navigator.push(context,
                                  MaterialPageRoute(builder: (_) => RequestDetailScreen(id: r['id'] as int)))
                              .then((_) => _refresh()),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ]),
      );
}
