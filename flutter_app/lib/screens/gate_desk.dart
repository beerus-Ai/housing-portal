import 'dart:async';

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
/// In register mode the guard can tap the card first or choose the person first. Contract: docs/nfc-api.md.
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
  Map<String, dynamic>? person; // register: who will carry the card
  String pending = ''; // register: a card tapped before the person was chosen
  String err = '';
  List<dynamic> people = [];
  Map<String, dynamic>? presence;
  List<dynamic> cards = [];
  bool? nfcOn; // null while checking; false: no NFC or switched off
  bool busy = false;
  final _serial = TextEditingController();
  final _search = TextEditingController();
  final _serialFocus = FocusNode();
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    load();
    if (widget.nfc) _startNfc();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    if (nfcOn == true) NfcManager.instance.stopSession();
    _serial.dispose();
    _search.dispose();
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
    if (register) {
      if (person == null) return setState(() => pending = serial); // registered as soon as a person is chosen
      return _register(serial);
    }
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

  Future<void> _register(String serial) async {
    final p = person!;
    busy = true;
    try {
      await app.run((a) => a.registerCard(serial, p['id'] as int));
      if (!mounted) return;
      toast(context, 'Card registered for ${p['name']}');
      setState(() {
        register = false;
        person = null;
        pending = '';
        people = [];
        last = null;
        _search.clear();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { err = e.message; pending = ''; });
    } finally {
      busy = false;
    }
    await load();
  }

  void setMode(bool reg, {String card = ''}) => setState(() {
        register = reg;
        person = null;
        pending = card;
        err = '';
        last = null;
      });

  void pick(Map<String, dynamic> p) {
    setState(() { person = p; err = ''; });
    if (pending.isNotEmpty) {
      _register(pending);
    } else {
      _serialFocus.requestFocus(); // a USB reader types into the card box
    }
  }

  void _onSearch(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final r = q.trim().isEmpty ? <dynamic>[] : await app.run((a) => a.gatePeople(q.trim()));
        if (mounted) setState(() => people = r);
      } catch (_) {
        if (mounted) setState(() => people = []);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final pr = presence;
    final inside = (pr?['inside'] as List?) ?? const [];
    final recent = (pr?['recent'] as List?) ?? const [];
    final active = cards.where((c) => c['active'] == true).toList();
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
                onPressed: () => setMode(!register),
                icon: Icon(register ? Icons.close : Icons.add_card),
                label: Text(register ? 'Cancel registering' : 'Register a card'),
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
          if (register) _registerPanel() else ...[
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

  Widget _registerPanel() => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Register a card', style: sectionStyle),
            const SizedBox(height: 8),
            Text(
              pending.isNotEmpty
                  ? 'Card $pending read. Now choose who carries it.'
                  : person != null
                      ? 'Now tap ${person!['name']}\'s card (or type its number above).'
                      : 'Tap the card first or choose the person first, in either order.',
              key: const Key('regHint'),
            ),
            const SizedBox(height: 8),
            TextField(
              key: const Key('search'),
              controller: _search,
              decoration: const InputDecoration(labelText: 'Who carries this card?', hintText: 'Search a name or flat', prefixIcon: Icon(Icons.search)),
              onChanged: _onSearch,
            ),
            for (final p in people)
              ListTile(
                contentPadding: EdgeInsets.zero,
                selected: person?['id'] == p['id'],
                leading: Icon(p['role'] == 'resident' ? Icons.home_outlined : Icons.engineering_outlined),
                title: Text('${p['name']}'),
                subtitle: Text(personSub(Map<String, dynamic>.from(p as Map))),
                onTap: () => pick(Map<String, dynamic>.from(p)),
              ),
            if (people.isEmpty && _search.text.trim().isNotEmpty) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Nobody matches.', style: TextStyle(color: Colors.black54))),
          ]),
        ),
      );
}
