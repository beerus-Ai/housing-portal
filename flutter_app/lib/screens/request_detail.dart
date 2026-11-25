import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../theme.dart';
import 'assign_sheet.dart';

class RequestDetailScreen extends StatefulWidget {
  const RequestDetailScreen({super.key, required this.id});
  final int id;
  @override
  State<RequestDetailScreen> createState() => _RequestDetailScreenState();
}

class _RequestDetailScreenState extends State<RequestDetailScreen> {
  late Future<(Map<String, dynamic>, List<dynamic>)> _future = _load();
  final _reply = TextEditingController();
  bool _busy = false;

  Future<(Map<String, dynamic>, List<dynamic>)> _load() async {
    final r = await app.run((a) => a.request(widget.id));
    final c = await app.run((a) => a.comments(widget.id));
    return (r, c);
  }

  void _refresh() => setState(() => _future = _load());

  Future<void> _act(Future<void> Function() f, String done) async {
    setState(() => _busy = true);
    try {
      await f();
      if (mounted) toast(context, done);
      _refresh();
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _assign(Map<String, dynamic> r) async {
    final pick = await showModalBottomSheet<AssignPick>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => AssignSheet(request: r),
    );
    if (pick == null) return;
    await _act(
      () => app.run((a) => a.assign(widget.id, vendorId: pick.vendorId, staffId: pick.staffId)),
      'Assigned to ${pick.name}. The resident has been told.',
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('Request #${widget.id}')),
        body: FutureBuilder<(Map<String, dynamic>, List<dynamic>)>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) return EmptyState(Icons.error_outline, '${snap.error}');
            final (r, comments) = snap.data!;
            final step = statusOrder.indexOf(r['status'] as String? ?? 'open');
            final next = step >= 0 && step < statusOrder.length - 1 ? statusOrder[step + 1] : null;
            final history = (r['history'] as List?) ?? const [];
            return ListView(padding: const EdgeInsets.all(16), children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Icon(catIcon(r['category']), color: Palette.accent700),
                      const SizedBox(width: 8),
                      Text(catLabel(r['category']), style: const TextStyle(color: Colors.black54)),
                      const Spacer(),
                      StatusChip(r['status']),
                    ]),
                    const SizedBox(height: 10),
                    Text(r['title'] ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                    if ((r['description'] ?? '').toString().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(r['description']),
                    ],
                    const SizedBox(height: 10),
                    Text([
                      'Flat ${r['flat'] ?? '-'}',
                      if (r['vendor_name'] != null) 'Vendor: ${r['vendor_name']}',
                      if (r['assignee_name'] != null) 'Staff: ${r['assignee_name']}',
                      shortDate(r['created_at']),
                    ].join(' · '), style: const TextStyle(color: Colors.black54)),
                  ]),
                ),
              ),
              const SizedBox(height: 12),
              _tracker(step),
              if (app.isAdmin && r['ai'] != null) ...[
                const SizedBox(height: 12),
                Card(
                  color: Palette.accent100,
                  child: ListTile(
                    leading: const Icon(Icons.auto_awesome, color: Palette.accent700),
                    title: Text('AI triage: ${r['ai']['priority'] ?? ''} · ${catLabel(r['ai']['category'])}'),
                    subtitle: Text('${r['ai']['summary'] ?? ''}\nSuggestion only. The committee decides.'),
                  ),
                ),
              ],
              // Committee: the server needs a vendor or staff member before a request can move forward,
              // so assignment comes first and "Move to" appears only once someone is assigned.
              if (app.isAdmin && next != null) ...[
                const SizedBox(height: 12),
                if (r['vendor_name'] == null && r['assignee_name'] == null) ...[
                  FilledButton.icon(
                    key: const Key('assign'),
                    onPressed: _busy ? null : () => _assign(r),
                    icon: const Icon(Icons.person_add_alt_1_outlined),
                    label: const Text('Assign vendor or staff'),
                  ),
                  const SizedBox(height: 6),
                  const Text('Assign someone first; then the request can move to the next stage.',
                      style: TextStyle(color: Colors.black54)),
                ] else ...[
                  FilledButton(
                    key: const Key('move'),
                    onPressed: _busy
                        ? null
                        : () => _act(() => app.run((a) => a.setStatus(widget.id, next)),
                            'Moved to ${statusLabel(next)}'),
                    child: Text('Move to ${statusLabel(next)}'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    onPressed: _busy ? null : () => _assign(r),
                    icon: const Icon(Icons.swap_horiz),
                    label: const Text('Change assignment'),
                  ),
                ],
              ],
              const SizedBox(height: 20),
              const Text('Messages', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              if (comments.isEmpty) const Text('No messages yet.', style: TextStyle(color: Colors.black54)),
              for (final c in comments)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(c['body'] ?? ''),
                    subtitle: Text('${c['author']} · ${shortDate(c['created_at'])}'),
                  ),
                ),
              const SizedBox(height: 8),
              TextField(
                controller: _reply,
                minLines: 1,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: 'Write a message',
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.send),
                    onPressed: _busy
                        ? null
                        : () {
                            final text = _reply.text.trim();
                            if (text.isEmpty) return;
                            _reply.clear();
                            _act(() => app.run((a) => a.addComment(widget.id, text)), 'Message sent');
                          },
                  ),
                ),
              ),
              if (history.isNotEmpty) ...[
                const SizedBox(height: 20),
                const Text('History', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                for (final h in history)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.history, size: 20),
                    title: Text('${h['action']}${h['detail'] != null ? ': ${h['detail']}' : ''}'),
                    subtitle: Text('${h['actor'] ?? 'System'} · ${shortDate(h['created_at'])}'),
                  ),
              ],
            ]);
          },
        ),
      );

  Widget _tracker(int step) => Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
          child: Row(children: [
            for (var i = 0; i < statusOrder.length; i++)
              Expanded(
                child: Column(children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: i <= step ? Palette.accent : Palette.bg,
                    child: Icon(i < step ? Icons.check : Icons.circle,
                        size: i < step ? 16 : 8, color: i <= step ? Colors.white : Colors.black26),
                  ),
                  const SizedBox(height: 6),
                  Text(statusLabel(statusOrder[i]),
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, fontWeight: i == step ? FontWeight.w700 : FontWeight.w400)),
                ]),
              ),
          ]),
        ),
      );
}
