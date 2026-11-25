import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../modules_util.dart';
import '../theme.dart';

/// Residents see their flat's bills; the committee raises bills and records payments received.
/// There is no online payment yet.
class DuesScreen extends StatefulWidget {
  const DuesScreen({super.key});
  @override
  State<DuesScreen> createState() => _DuesScreenState();
}

class _DuesScreenState extends State<DuesScreen> {
  String? _status;
  late Future<Map<String, dynamic>> _future = _load();

  Future<Map<String, dynamic>> _load() => app.run((a) => a.dues(status: _status));

  Future<void> _refresh() async {
    final f = _load();
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Maintenance dues')),
        floatingActionButton: app.isAdmin
            ? FloatingActionButton.extended(
                icon: const Icon(Icons.receipt_long_outlined),
                label: const Text('Raise bills'),
                onPressed: () async {
                  final ok = await showModalBottomSheet<bool>(
                      context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => const _RaiseSheet());
                  if (ok == true) _refresh();
                },
              )
            : null,
        body: RefreshIndicator(
          onRefresh: _refresh,
          child: FutureBuilder<Map<String, dynamic>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
              if (snap.hasError) return ListView(children: [EmptyState(Icons.cloud_off, '${snap.error}')]);
              final dues = (snap.data!['dues'] as List).cast<Map>();
              final t = snap.data!['totals'] as Map;
              return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), children: [
                if (app.isResident) ...[
                  Text('Flat ${app.user?['flat'] ?? ''}', style: const TextStyle(color: Colors.black54)),
                  const SizedBox(height: 10),
                  statGrid([
                    StatTile(icon: Icons.account_balance_wallet_outlined, value: rupees(t['outstanding'] as num?), label: 'Balance to pay',
                        sub: (t['overdue'] as num? ?? 0) > 0 ? '${t['overdue']} overdue' : 'Nothing overdue'),
                    StatTile(icon: Icons.check_circle_outline, value: rupees(t['collected'] as num?), label: 'Paid so far'),
                  ]),
                  const SizedBox(height: 12),
                  const Card(
                    color: Palette.accent100,
                    child: ListTile(
                      leading: Icon(Icons.currency_rupee, color: Palette.accent700),
                      title: Text('Pay at the society office or by UPI to the society account. The committee records it here. Online payment is coming later.'),
                    ),
                  ),
                ] else ...[
                  statGrid([
                    StatTile(icon: Icons.receipt_long_outlined, value: rupees(t['billed'] as num?), label: 'Billed'),
                    StatTile(icon: Icons.check_circle_outline, value: rupees(t['collected'] as num?), label: 'Collected'),
                    StatTile(icon: Icons.account_balance_wallet_outlined, value: rupees(t['outstanding'] as num?), label: 'Outstanding'),
                    StatTile(icon: Icons.schedule, value: '${t['overdue']}', label: 'Overdue bills'),
                  ]),
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, children: [
                    for (final s in [null, 'overdue', 'unpaid', 'partial', 'paid'])
                      ChoiceChip(
                        label: Text(s == null ? 'All' : dueStatusLabel(s)),
                        selected: _status == s,
                        onSelected: (_) {
                          _status = s;
                          _refresh();
                        },
                      ),
                  ]),
                ],
                const SizedBox(height: 12),
                if (dues.isEmpty) EmptyState(Icons.receipt_long_outlined, app.isAdmin ? 'No bills match.' : 'No bills for your flat yet.'),
                for (final d in dues)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text(app.isAdmin ? 'Flat ${d['flat']} · ${d['title']} ${d['period']}' : '${d['title']} ${d['period']}'),
                      subtitle: Text('Bill ${rupees(d['amount'] as num?)} · paid ${rupees(d['paid'] as num?)} · balance ${rupees(d['balance'] as num?)}\nDue ${dayLabel(d['due_date'] as String)}'),
                      isThreeLine: true,
                      trailing: dueChip(d['status'] as String?),
                      onTap: app.isAdmin && (d['balance'] as num) > 0
                          ? () async {
                              final ok = await showModalBottomSheet<bool>(
                                  context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => _PaySheet(due: d));
                              if (ok == true) _refresh();
                            }
                          : null,
                    ),
                  ),
                if (app.isAdmin && dues.any((d) => (d['balance'] as num) > 0))
                  const Text('Tap a bill to record a payment.', style: TextStyle(color: Colors.black54)),
              ]);
            },
          ),
        ),
      );
}

class _PaySheet extends StatefulWidget {
  const _PaySheet({required this.due});
  final Map due;
  @override
  State<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<_PaySheet> {
  late final _amount = TextEditingController(text: '${widget.due['balance']}');
  final _ref = TextEditingController();
  String _method = 'upi';
  bool _busy = false;

  Future<void> _save() async {
    final amount = num.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) return toast(context, 'Enter the amount received', error: true);
    setState(() => _busy = true);
    try {
      final left = await app.run((a) => a.recordPayment(widget.due['id'] as int, amount: amount, method: _method, reference: _ref.text.trim()));
      if (!mounted) return;
      toast(context, left > 0 ? 'Payment recorded. Balance ${rupees(left)}.' : 'Paid in full. The flat has been told.');
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Record payment · Flat ${widget.due['flat']}', style: sectionStyle),
          Text('${widget.due['title']} ${widget.due['period']} · balance ${rupees(widget.due['balance'] as num?)}', style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 12),
          TextField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Amount received (₹)')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _method,
            decoration: const InputDecoration(labelText: 'Method'),
            items: const [
              DropdownMenuItem(value: 'upi', child: Text('UPI')),
              DropdownMenuItem(value: 'cash', child: Text('Cash')),
              DropdownMenuItem(value: 'bank', child: Text('Bank transfer')),
              DropdownMenuItem(value: 'cheque', child: Text('Cheque')),
            ],
            onChanged: (v) => setState(() => _method = v ?? 'upi'),
          ),
          const SizedBox(height: 12),
          TextField(controller: _ref, maxLength: 100, decoration: const InputDecoration(labelText: 'Reference (optional)', hintText: 'UPI ref, cheque no.')),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Record payment')),
        ]),
      );
}

class _RaiseSheet extends StatefulWidget {
  const _RaiseSheet();
  @override
  State<_RaiseSheet> createState() => _RaiseSheetState();
}

class _RaiseSheetState extends State<_RaiseSheet> {
  final _amount = TextEditingController();
  final _title = TextEditingController(text: 'Maintenance');
  late String _period = istToday().substring(0, 7);
  late String _due = addDays(istToday(), 10);
  bool _busy = false;

  Future<void> _save() async {
    final amount = num.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) return toast(context, 'Enter the amount per flat', error: true);
    setState(() => _busy = true);
    try {
      final r = await app.run((a) => a.raiseDues(period: _period, amount: amount, dueDate: _due, title: _title.text.trim().isEmpty ? 'Maintenance' : _title.text.trim()));
      if (!mounted) return;
      final skipped = r['skipped'] as int? ?? 0;
      toast(context, '${r['created']} bills raised${skipped > 0 ? ', $skipped already billed' : ''}');
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _pickDue() async {
    final now = DateTime.parse(istToday());
    final d = await showDatePicker(context: context, initialDate: DateTime.parse(_due), firstDate: now.subtract(const Duration(days: 60)), lastDate: now.add(const Duration(days: 120)));
    if (d != null) setState(() => _due = ymd(d));
  }

  @override
  Widget build(BuildContext context) {
    final months = [for (var i = -1; i <= 2; i++) ymd(DateTime(int.parse(istToday().substring(0, 4)), int.parse(istToday().substring(5, 7)) + i, 1)).substring(0, 7)];
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Raise bills for every flat', style: sectionStyle),
        const Text('Each flat with residents is billed once per month and title, and its residents are told.', style: TextStyle(color: Colors.black54)),
        const SizedBox(height: 12),
        Wrap(spacing: 8, children: [
          for (final m in months) ChoiceChip(label: Text(m), selected: _period == m, onSelected: (_) => setState(() => _period = m)),
        ]),
        const SizedBox(height: 12),
        TextField(controller: _title, maxLength: 100, decoration: const InputDecoration(labelText: 'Title')),
        TextField(controller: _amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount per flat (₹)')),
        const SizedBox(height: 8),
        ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.event_outlined), title: Text('Due ${dayLabel(_due)}'), trailing: const Icon(Icons.edit_calendar_outlined), onTap: _pickDue),
        const SizedBox(height: 8),
        FilledButton(onPressed: _busy ? null : _save, child: const Text('Raise bills')),
      ]),
    );
  }
}
