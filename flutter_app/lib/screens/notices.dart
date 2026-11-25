import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../theme.dart';

class NoticesScreen extends StatefulWidget {
  const NoticesScreen({super.key});
  @override
  State<NoticesScreen> createState() => _NoticesScreenState();
}

class _NoticesScreenState extends State<NoticesScreen> {
  late Future<List<dynamic>> _future = app.run((a) => a.notices());

  Future<void> _refresh() async {
    final f = app.run((a) => a.notices());
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Notices')),
        body: RefreshIndicator(
          onRefresh: _refresh,
          child: FutureBuilder<List<dynamic>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snap.hasError) return ListView(children: [EmptyState(Icons.cloud_off, '${snap.error}')]);
              final list = snap.data!;
              if (list.isEmpty) {
                return ListView(children: const [EmptyState(Icons.campaign_outlined, 'No notices yet')]);
              }
              return ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final n = list[i];
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(n['title'] ?? '', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text('${n['author'] ?? 'Committee'} · ${shortDate(n['created_at'])}',
                            style: const TextStyle(color: Colors.black54, fontSize: 13)),
                        const SizedBox(height: 10),
                        Text(n['body'] ?? '', style: const TextStyle(fontSize: 15)),
                      ]),
                    ),
                  );
                },
              );
            },
          ),
        ),
      );
}
