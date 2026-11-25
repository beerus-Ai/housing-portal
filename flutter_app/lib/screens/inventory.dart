import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../modules_util.dart';
import '../theme.dart';

const _cats = ['plumbing', 'electrical', 'cleaning', 'safety', 'garden', 'office', 'other'];
String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// Committee: add items, stock in and out. Staff: take stock out for a job.
class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});
  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  late Future<List<dynamic>> _future = app.run((a) => a.inventory());

  Future<void> _refresh() async {
    final f = app.run((a) => a.inventory());
    setState(() => _future = f);
    await f;
  }

  Future<void> _sheet(Widget w) async {
    final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => w);
    if (ok == true) _refresh();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Inventory')),
        floatingActionButton: app.isAdmin
            ? FloatingActionButton.extended(icon: const Icon(Icons.add), label: const Text('Add item'), onPressed: () => _sheet(const _AddItemSheet()))
            : null,
        body: RefreshIndicator(
          onRefresh: _refresh,
          child: FutureBuilder<List<dynamic>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
              if (snap.hasError) return ListView(children: [EmptyState(Icons.cloud_off, '${snap.error}')]);
              final items = snap.data!.cast<Map>();
              final low = items.where((i) => i['low'] == true).toList();
              return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 96), children: [
                statGrid([
                  StatTile(icon: Icons.inventory_2_outlined, value: '${items.length}', label: 'Items'),
                  StatTile(icon: Icons.warning_amber_outlined, value: '${low.length}', label: 'To reorder', sub: low.take(2).map((i) => i['name']).join(', ')),
                ]),
                const SizedBox(height: 12),
                if (items.isEmpty) EmptyState(Icons.inventory_2_outlined, app.isAdmin ? 'No items yet. Add the first one.' : 'No items yet.'),
                for (final i in items)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      title: Text('${i['name']}'),
                      subtitle: Text([_cap('${i['category']}'), 'reorder at ${i['min_qty']}', if (i['location'] != null) '${i['location']}'].join(' · ')),
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text('${i['quantity']} ${i['unit']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        Text(i['low'] == true ? 'Reorder' : 'In stock',
                            style: TextStyle(fontSize: 12, color: i['low'] == true ? Palette.badge : Palette.accent700, fontWeight: FontWeight.w600)),
                      ]),
                      onTap: () => _sheet(_MoveSheet(item: i)),
                    ),
                  ),
                if (items.isNotEmpty) Text(app.isAdmin ? 'Tap an item to record stock in or out.' : 'Tap an item to take stock out for a job.', style: const TextStyle(color: Colors.black54)),
              ]);
            },
          ),
        ),
      );
}

class _MoveSheet extends StatefulWidget {
  const _MoveSheet({required this.item});
  final Map item;
  @override
  State<_MoveSheet> createState() => _MoveSheetState();
}

class _MoveSheetState extends State<_MoveSheet> {
  final _qty = TextEditingController();
  final _req = TextEditingController();
  final _note = TextEditingController();
  bool _in = false, _busy = false;

  Future<void> _save() async {
    final n = int.tryParse(_qty.text.trim());
    if (n == null || n <= 0) {
      toast(context, 'Enter how many', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final it = await app.run((a) => a.moveStock(widget.item['id'] as int, _in ? n : -n, note: _note.text.trim(), requestId: int.tryParse(_req.text.trim())));
      if (!mounted) return;
      toast(context, '${it['name']}: ${it['quantity']} ${it['unit']} left${it['low'] == true ? '. Time to reorder.' : ''}');
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
          Text('${widget.item['name']}', style: sectionStyle),
          Text('${widget.item['quantity']} ${widget.item['unit']} in stock', style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 12),
          if (app.isAdmin)
            SegmentedButton<bool>(
              segments: const [ButtonSegment(value: false, label: Text('Out (used)')), ButtonSegment(value: true, label: Text('In (bought)'))],
              selected: {_in},
              onSelectionChanged: (s) => setState(() => _in = s.first),
            ),
          const SizedBox(height: 12),
          TextField(controller: _qty, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'How many (${widget.item['unit']})')),
          const SizedBox(height: 12),
          if (!_in) TextField(controller: _req, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'For request # (optional)')),
          if (!_in) const SizedBox(height: 12),
          TextField(controller: _note, maxLength: 200, decoration: const InputDecoration(labelText: 'Note (optional)')),
          FilledButton(onPressed: _busy ? null : _save, child: Text(_in ? 'Add stock' : 'Take out')),
        ]),
      );
}

class _AddItemSheet extends StatefulWidget {
  const _AddItemSheet();
  @override
  State<_AddItemSheet> createState() => _AddItemSheetState();
}

class _AddItemSheetState extends State<_AddItemSheet> {
  final _name = TextEditingController();
  final _qty = TextEditingController(text: '0');
  final _min = TextEditingController(text: '0');
  final _unit = TextEditingController(text: 'pcs');
  final _loc = TextEditingController();
  String _cat = 'other';
  bool _busy = false;

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      toast(context, 'Give the item a name', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await app.run((a) => a.addItem(
            name: _name.text.trim(),
            category: _cat,
            quantity: int.tryParse(_qty.text.trim()) ?? 0,
            minQty: int.tryParse(_min.text.trim()) ?? 0,
            unit: _unit.text.trim().isEmpty ? 'pcs' : _unit.text.trim(),
            location: _loc.text.trim(),
          ));
      if (!mounted) return;
      toast(context, 'Item added');
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Add an item', style: sectionStyle),
            const SizedBox(height: 12),
            TextField(controller: _name, maxLength: 80, decoration: const InputDecoration(labelText: 'Item', hintText: 'LED tube 20W')),
            DropdownButtonFormField<String>(
              initialValue: _cat,
              decoration: const InputDecoration(labelText: 'Category'),
              items: [for (final c in _cats) DropdownMenuItem(value: c, child: Text(_cap(c)))],
              onChanged: (v) => setState(() => _cat = v ?? 'other'),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: TextField(controller: _qty, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantity now'))),
              const SizedBox(width: 12),
              Expanded(child: TextField(controller: _unit, maxLength: 20, decoration: const InputDecoration(labelText: 'Unit', counterText: ''))),
            ]),
            const SizedBox(height: 12),
            TextField(controller: _min, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Reorder level', helperText: 'The committee is told at or below this')),
            const SizedBox(height: 12),
            TextField(controller: _loc, maxLength: 80, decoration: const InputDecoration(labelText: 'Location (optional)', hintText: 'Store room')),
            FilledButton(onPressed: _busy ? null : _save, child: const Text('Add item')),
          ]),
        ),
      );
}
