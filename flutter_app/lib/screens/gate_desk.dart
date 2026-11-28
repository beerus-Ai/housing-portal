
import 'package:material_ui/material_ui.dart';
import 'package:nfc_manager/nfc_manager.dart';

import '../api.dart';
import '../app_state.dart';
import '../modules_util.dart';
import '../nfc_serial.dart';
import '../theme.dart';

/// Gate desk (guards; the committee can open it too), the app version of the web gate desk (`public/web-nfc.js`).
/// A tap checks the card holder in or out; "Register a card" links a new card to a person. The card is read with the
/// phone's NFC (its serial number, the same value Web NFC gives) or typed in, e.g. by a USB reader on OTG.
/// Register opens a full-screen scanner: scan the card, then choose who carries it from a dropdown. Contract: docs/nfc-api.md.
class GateDeskScreen extends StatefulWidget {
  const GateDeskScreen({super.key, this.nfc = true});

  /// Tests turn the NFC plugin off (it needs a device).
  final bool nfc;
  @override
  State<GateDeskScreen> createState() => GateDeskState();
}

class GateDeskState extends State<GateDeskScreen> {
  bool register = false;
  Map<String, dynamic>? last; // tap result, or {error, serial, unknown}
  String card = ''; // register: the card number read by the scanner
  int? whoId; // register: the person chosen in the dropdown
  String err = '';
  List<dynamic> people = []; // everyone who can carry a card (GET /api/gate/people without q)
  Map<String, dynamic>? presence;
  List<dynamic> cards = [];
  bool? nfcOn; // null while checking; false: no NFC or switched off
  bool busy = false;
  final _serial = TextEditingController();
  final _serialFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    load();
    if (widget.nfc) _startNfc();
  }

  @override
  void dispose() {
    if (nfcOn == true) NfcManager.instance.stopSession();
    _serial.dispose();
    _serialFocus.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final r = await Future.wait([app.run((a) => a.gatePresence()), app.run((a) => a.gateCards())]);
      if (!mounted) return;
      setState(() {
        presence = r[0] as Map<String, dynamic>;
        cards = r[1] as List<dynamic>;
      });
    } catch (e) {
      if (mounted) setState(() => err = '$e');
    }
  }

  /// Android keeps one reader session open, so every tap arrives here until the screen closes.
  Future<void> _startNfc() async {
    bool ok = false;
    try {
      ok = await NfcManager.instance.isAvailable();
    } catch (_) {}
    if (!mounted) return;
    setState(() => nfcOn = ok);
    if (!ok) return;
    NfcManager.instance.startSession(
      onDiscovered: (NfcTag tag) async {
        final s = serialFromTagData(tag.data);
        if (!mounted) return;
        if (s.isEmpty) return toast(context, 'Could not read that card. Hold it still and try again.', error: true);
        await handleSerial(s);
      },
      onError: (e) async {
        if (mounted) toast(context, 'Could not read that card. Hold it still and try again.', error: true);
      },
    );
  }

  Future<void> handleSerial(String raw) async {
    final serial = normSerial(raw);
    if (busy) return;
    setState(() => err = '');
    if (serial.length < 4) return setState(() => err = 'Tap the card, or type its number (4 to 40 hex characters)');
    if (register) return setState(() { card = serial; whoId = null; }); // next: choose who carries it
    busy = true;
    try {
      final r = await app.run((a) => a.tapCard(serial));
      if (mounted) setState(() => last = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => last = {'error': e.message, 'serial': serial, 'unknown': e.status == 404});
    } finally {
      busy = false;
    }
    await load();
  }

  Future<void> _register() async {
    final p = people.cast<Map>().firstWhere((x) => x['id'] == whoId);
    busy = true;
    try {
      await app.run((a) => a.registerCard(card, whoId!));
      if (!mounted) return;
      toast(context, 'Card registered for ${p['name']}');
      setState(() { register = false; card = ''; whoId = null; last = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => err = e.message);
    } finally {
      busy = false;
    }
    await load();
  }

  /// Register opens the full-screen scanner; once a card is read, a dropdown asks who carries it.
  Future<void> setMode(bool reg, {String card = ''}) async {
    setState(() { register = reg; this.card = normSerial(card); whoId = null; err = ''; last = null; });
    if (!reg) return;
    try {
      final r = await app.run((a) => a.gatePeople(''));
      if (mounted) setState(() => people = r);
    } catch (e) {
      if (mounted) setState(() => err = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final pr = presence;
    final inside = (pr?['inside'] as List?) ?? const [];
    final recent = (pr?['recent'] as List?) ?? const [];
    final active = cards.where((c) => c['active'] == true).toList();
    if (register) return _scanner();
    return Scaffold(
      appBar: AppBar(title: const Text('Gate desk')),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Text(pr == null ? 'Loading…' : '${inside.length} people inside · ${pr['cards'] ?? 0} cards registered',
              style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 12),
          _result(),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () => setMode(true),
                icon: const Icon(Icons.add_card),
                label: const Text('Register a card'),
              ),
            ),
          ]),
          const SizedBox(height: 12),
          TextField(
            key: const Key('serial'),
            controller: _serial,
            focusNode: _serialFocus,
            autofocus: !register,
            textInputAction: TextInputAction.go,
            decoration: const InputDecoration(labelText: 'Card number', hintText: 'Or type it (a USB reader types it here)', suffixIcon: Icon(Icons.keyboard_return)),
            onSubmitted: (v) {
              _serial.clear();
              if (v.trim().isNotEmpty) handleSerial(v);
            },
          ),
          if (err.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(err, style: const TextStyle(color: Palette.errorText, fontWeight: FontWeight.w600))),
          const SizedBox(height: 20),
          ...[
            const Text('Inside now', style: sectionStyle),
            if (inside.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('Nobody checked in.', style: TextStyle(color: Colors.black54))),
            for (final p in inside)
              ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.person_outline), title: Text('${p['name']}'), subtitle: Text(personSub(Map<String, dynamic>.from(p as Map))), trailing: Text('since ${shortDate(p['at'] as String?)}', style: const TextStyle(fontSize: 12))),
          ],
          const SizedBox(height: 16),
          const Text('Latest taps', style: sectionStyle),
          if (recent.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('No taps yet.', style: TextStyle(color: Colors.black54))),
          for (final t in recent.take(12))
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(t['direction'] == 'in' ? Icons.login : Icons.logout, color: Palette.accent700),
              title: Text('${t['name']}'),
              subtitle: Text(personSub(Map<String, dynamic>.from(t as Map))),
              trailing: Text('${t['direction'] == 'in' ? 'In' : 'Out'} · ${shortDate(t['at'] as String?)}', style: const TextStyle(fontSize: 12)),
            ),
          const SizedBox(height: 16),
          const Text('Registered cards', style: sectionStyle),
          if (active.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('No cards registered yet.', style: TextStyle(color: Colors.black54))),
          for (final c in active)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.badge_outlined),
              title: Text('${c['name']}'),
              subtitle: Text('${personSub(Map<String, dynamic>.from(c as Map))} · ${c['serial']}'),
              trailing: PopupMenuButton<String>(
                tooltip: 'Card of ${c['name']}',
                onSelected: (_) async {
                  try {
                    await app.run((a) => a.deactivateCard(c['id'] as int));
                    if (context.mounted) toast(context, 'Card deactivated');
                  } catch (e) {
                    if (context.mounted) toast(context, '$e', error: true);
                  }
                  await load();
                },
                itemBuilder: (_) => const [PopupMenuItem(value: 'off', child: Text('Deactivate card'))],
              ),
            ),
        ]),
      ),
    );
  }

  Widget _result() {
    final l = last;
    final listening = nfcOn == true;
    final (IconData icon, String title, String sub, Color bg) = l == null
        ? (Icons.contactless_outlined, register ? 'Tap the new card' : 'Tap a card',
            nfcOn == null ? 'Checking NFC…' : listening ? 'Listening for NFC cards…' : 'NFC is off or missing on this phone. Type the card number below.', Palette.accent100)
        : l['error'] != null
            ? (Icons.cancel_outlined, '${l['error']}', 'Card ${l['serial'] ?? ''}', const Color(0xFFF1EFEE))
            : (l['direction'] == 'in' ? Icons.login : Icons.logout,
                '${l['direction'] == 'in' ? 'Checked in' : 'Checked out'}: ${(l['person'] as Map?)?['name'] ?? ''}',
                '${shortDate(l['at'] as String?)}${l['shift'] != null ? ' · shift ${l['shift']}' : ''}', Palette.accent100);
    return Card(
      key: const Key('result'),
      color: bg,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(children: [
          Icon(icon, size: 48, color: Palette.accent700),
          const SizedBox(height: 8),
          Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(sub, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54)),
          if (l != null && l['unknown'] == true) ...[
            const SizedBox(height: 12),
            FilledButton.icon(onPressed: () => setMode(true, card: '${l['serial']}'), icon: const Icon(Icons.add_card), label: const Text('Register this card')),
          ],
        ]),
      ),
    );
  }

  /// Full-screen scanner for registering, the same steps as the web: scan the card, then choose who carries it.
  Widget _scanner() {
    final status = nfcOn == null
        ? 'Checking NFC…'
        : nfcOn == true
            ? 'Listening… hold the card to the back of the phone.'
            : 'NFC is off or missing on this phone. Type the card number below.';
    final done = card.isNotEmpty;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Register a card'),
        leading: IconButton(tooltip: 'Close the scanner', icon: const Icon(Icons.close), onPressed: () => setState(() { register = false; card = ''; whoId = null; err = ''; })),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              CircleAvatar(
                radius: 76,
                backgroundColor: done ? const Color(0xFFE3F5EC) : Palette.accent100,
                child: Icon(done ? Icons.badge_outlined : Icons.contactless_outlined, size: 76, color: done ? const Color(0xFF12402C) : Palette.accent700),
              ),
              const SizedBox(height: 16),
              Text(done ? 'Card detected' : 'Tap the new card', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              if (done) ...[
                Text(card, key: const Key('cardNo'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, fontFamily: 'monospace', letterSpacing: 1.5)),
                const SizedBox(height: 20),
                DropdownButtonFormField<int>(
                  key: const Key('who'),
                  value: whoId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Who carries this card?'),
                  hint: const Text('Choose a person'),
                  items: [
                    for (final p in people)
                      DropdownMenuItem(value: p['id'] as int, child: Text('${p['name']} · ${personSub(Map<String, dynamic>.from(p as Map))}', overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => whoId = v),
                ),
                if (people.isEmpty) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Nobody can get a card yet: residents and staff must be approved first.', style: TextStyle(color: Colors.black54))),
                const SizedBox(height: 20),
                SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: whoId == null ? null : _register, icon: const Icon(Icons.check_circle_outline), label: const Text('Register card'))),
                TextButton.icon(onPressed: () => setState(() { card = ''; whoId = null; err = ''; }), icon: const Icon(Icons.refresh), label: const Text('Scan a different card')),
              ] else ...[
                Text(status, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54)),
                const SizedBox(height: 20),
                TextField(
                  key: const Key('serial'),
                  controller: _serial,
                  autofocus: true,
                  textInputAction: TextInputAction.go,
                  decoration: const InputDecoration(labelText: 'Card number', hintText: 'Or type it (a USB reader types it here)', suffixIcon: Icon(Icons.keyboard_return)),
                  onSubmitted: (v) {
                    _serial.clear();
                    if (v.trim().isNotEmpty) handleSerial(v);
                  },
                ),
              ],
              if (err.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(err, style: const TextStyle(color: Palette.errorText, fontWeight: FontWeight.w600))),
            ]),
          ),
        ),
      ),
    );
  }
}
