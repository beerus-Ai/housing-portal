import 'package:material_ui/material_ui.dart';
import 'package:nfc_manager/nfc_manager.dart';

import '../api.dart';
import '../app_state.dart';
import '../card_wallet.dart';
import '../modules_util.dart';
import '../nfc_serial.dart';
import '../theme.dart';

/// Counter for the tuck shop owner and the laundry service (docs/card-wallet-api.md). Tap the resident's community
/// card (phone NFC, or type the number; a USB reader types it too), `POST /api/card/lookup` shows who it is and the
/// flat's wallet, then sell items (shop) or take clothes in (laundry) and pay by cash, UPI, wallet or the account.
class CounterScreen extends StatefulWidget {
  const CounterScreen({super.key, this.nfc = true, this.api, this.role});

  /// Tests turn the NFC plugin off (it needs a device) and pass a client with a mock backend.
  final bool nfc;
  final Api? api;

  /// shop or laundry; defaults to the signed-in role.
  final String? role;
  @override
  State<CounterScreen> createState() => CounterState();
}

class CounterState extends State<CounterScreen> {
  List<dynamic> items = []; // shop items or laundry rates
  Map<String, dynamic>? holder; // card lookup of the current customer
  String serial = '';
  final Map<int, int> cart = {};
  String pay = 'cash';
  String err = '';
  Map<String, dynamic>? done; // the last sale
  bool? nfcOn;
  bool busy = false;
  final _serial = TextEditingController();

  String get role => widget.role ?? app.role;
  bool get shop => role == 'shop';
  Future<T> _run<T>(Future<T> Function(Api a) f) => widget.api != null ? f(widget.api!) : app.run(f);

  @override
  void initState() {
    super.initState();
    loadItems();
    if (widget.nfc) _startNfc();
  }

  @override
  void dispose() {
    if (nfcOn == true) NfcManager.instance.stopSession();
    _serial.dispose();
    super.dispose();
  }

  Future<void> loadItems() async {
    try {
      final r = await _run((a) => shop ? a.shopItems() : a.laundryRates());
      if (mounted) setState(() => items = r);
    } catch (e) {
      if (mounted) setState(() => err = '$e');
    }
  }

  /// Same reader session as the gate desk: every tap arrives here while the screen is open.
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
    final s = normSerial(raw);
    if (busy) return;
    setState(() {
      err = '';
      done = null;
    });
    if (s.length < 4 || s.length > 40) return setState(() => err = 'Tap the card, or type its number (4 to 40 hex characters)');
    busy = true;
    try {
      final h = await _run((a) => a.cardLookup(s));
      if (!mounted) return;
      setState(() {
        holder = null;
        if (h['role'] != 'resident' || h['flat'] == null) {
          err = '${h['name']} is not a resident. Only a resident’s card can buy here.';
        } else if (h['frozen'] == true) {
          err = 'This card is frozen. Its owner can unfreeze it under Profile > My community card.';
        } else {
          holder = h;
          serial = s;
          cart.clear();
          pay = 'cash';
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { holder = null; err = e.message; });
    } finally {
      busy = false;
    }
  }

  String nameOf(dynamic it) => '${it['name'] ?? it['item'] ?? ''}';

  num get total => (items.fold<num>(0, (t, it) => t + (cart[it['id']] ?? 0) * (asNum(it['price']) ?? 0)) * 100).round() / 100;

  num? get walletBalance => asNum((holder?['wallet'] as Map?)?['balance']);

  bool get walletShort => pay == 'wallet' && (walletBalance ?? 0) < total;

  void setQty(int id, int n) => setState(() {
        err = '';
        if (n <= 0) {
          cart.remove(id);
        } else {
          cart[id] = n;
        }
      });

  void nextCustomer() => setState(() {
        holder = null;
        serial = '';
        cart.clear();
        pay = 'cash';
        err = '';
        done = null;
      });

  Future<void> charge() async {
    final h = holder;
    if (h == null || busy) return;
    final lines = {for (final e in cart.entries) if (e.value > 0) e.key: e.value};
    if (lines.isEmpty) return setState(() => err = 'Add at least one item');
    setState(() {
      busy = true;
      err = '';
    });
    final sum = total;
    try {
      final r = await _run((a) => shop ? a.shopCounter(serial, lines, pay) : a.laundryCounter(serial, lines, pay));
      if (!mounted) return;
      setState(() {
        done = {
          'id': r['id'],
          'total': r['total'] ?? sum,
          'payment': r['payment'] ?? pay,
          'name': r['name'] ?? h['name'],
          'flat': r['flat'] ?? h['flat'],
        };
        holder = null;
        serial = '';
        cart.clear();
        pay = 'cash';
      });
      toast(context, '${rupees(asNum(done!['total']))} paid by ${paymentLabel('${done!['payment']}')}');
      if (shop) await loadItems();
    } on ApiException catch (e) {
      if (mounted) setState(() => err = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = holder;
    return Scaffold(
      appBar: AppBar(title: Text(shop ? 'Tuck shop counter' : 'Laundry counter')),
      body: ListView(padding: const EdgeInsets.all(16), children: h == null ? _reader() : _sale(h)),
    );
  }

  List<Widget> _errText() => [
        if (err.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(err, key: const Key('counterError'), style: const TextStyle(color: Palette.errorText, fontWeight: FontWeight.w600)),
          ),
      ];

  List<Widget> _reader() {
    final d = done;
    final status = nfcOn == null
        ? 'Checking NFC…'
        : nfcOn == true
            ? 'Listening… hold the card to the back of the phone.'
            : 'NFC is off or missing on this phone. Type the card number below.';
    return [
      if (d != null)
        Card(
          key: const Key('done'),
          color: const Color(0xFFE3F5EC),
          child: ListTile(
            leading: const Icon(Icons.check_circle_outline, color: Color(0xFF12402C)),
            title: Text('${rupees(asNum(d['total']))} from ${d['name'] ?? ''}${d['flat'] != null ? ', Flat ${d['flat']}' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('${paymentLabel('${d['payment']}')}${d['id'] != null ? ' · order #${d['id']}' : ''}'),
          ),
        ),
      if (d != null) const SizedBox(height: 12),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(children: [
            const CircleAvatar(radius: 44, backgroundColor: Palette.accent100, child: Icon(Icons.contactless_outlined, size: 48, color: Palette.accent700)),
            const SizedBox(height: 12),
            const Text('Tap the resident’s card', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(status, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54)),
          ]),
        ),
      ),
      const SizedBox(height: 12),
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
      ..._errText(),
    ];
  }

  List<Widget> _sale(Map<String, dynamic> h) {
    final bal = walletBalance;
    final credit = h['credit'] as Map?;
    final shown = items.where((it) => it['active'] != false && (!shop || (asNum(it['stock']) ?? 0) > 0 || cart.containsKey(it['id']))).toList();
    final sum = total;
    return [
      Card(
        key: const Key('holder'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${h['name'] ?? ''}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            Text('Flat ${h['flat']}', style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 8),
            Wrap(spacing: 16, runSpacing: 4, children: [
              if (bal != null) Text('Wallet ${rupees(bal)}', key: const Key('walletBalance'), style: const TextStyle(fontWeight: FontWeight.w700, color: Palette.accent700)),
              if (credit != null)
                Text('On account ${rupees(asNum(credit['used']))}${credit['limit'] != null ? ' of ${rupees(asNum(credit['limit']))}' : ''}', style: const TextStyle(color: Colors.black54)),
            ]),
          ]),
        ),
      ),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(onPressed: nextCustomer, icon: const Icon(Icons.refresh), label: const Text('Next customer')),
      ),
      Text(shop ? 'Items' : 'Clothes handed over', style: sectionStyle),
      if (shown.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(shop ? 'Nothing in stock.' : 'No laundry rates yet.', style: const TextStyle(color: Colors.black54))),
      for (final it in shown) _line(it),
      const SizedBox(height: 16),
      Row(children: [
        const Expanded(child: Text('Total', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
        Text(rupees(sum), key: const Key('total'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
      ]),
      const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final p in payments)
          ChoiceChip(
            key: Key('pay-${p.$1}'),
            label: Text(p.$1 == 'wallet' && bal != null ? 'Wallet (${rupees(bal)})' : p.$2),
            selected: pay == p.$1,
            onSelected: p.$1 == 'wallet' && bal == null ? null : (_) => setState(() { pay = p.$1; err = ''; }),
          ),
      ]),
      if (walletShort)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text('Wallet balance is ${rupees(bal)}. Choose another way, or the resident tops up with the committee.', style: const TextStyle(color: Palette.errorText)),
        ),
      ..._errText(),
      const SizedBox(height: 16),
      FilledButton.icon(
        key: const Key('charge'),
        onPressed: sum > 0 && !busy && !walletShort ? charge : null,
        icon: const Icon(Icons.check_circle_outline),
        label: Text('${shop ? 'Sell' : 'Hand over'} for ${rupees(sum)}'),
      ),
    ];
  }

  Widget _line(dynamic it) {
    final id = it['id'] as int;
    final n = cart[id] ?? 0;
    final stock = asNum(it['stock']) ?? 0;
    final unit = it['unit'];
    final sub = '${rupees(asNum(it['price']))}${unit != null && '$unit'.isNotEmpty ? ' / $unit' : ''}${shop ? ' · $stock left' : ''}';
    return ListTile(
      key: Key('line-$id'),
      contentPadding: EdgeInsets.zero,
      title: Text(nameOf(it), style: TextStyle(fontWeight: n > 0 ? FontWeight.w700 : FontWeight.w500)),
      subtitle: Text(sub),
      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(tooltip: 'One less ${nameOf(it)}', onPressed: n > 0 ? () => setQty(id, n - 1) : null, icon: const Icon(Icons.remove_circle_outline)),
        SizedBox(width: 28, child: Text('$n', key: Key('qty-$id'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
        IconButton(
          key: Key('add-$id'),
          tooltip: 'One more ${nameOf(it)}',
          onPressed: shop && n >= stock ? null : () => setQty(id, n + 1),
          icon: const Icon(Icons.add_circle_outline),
        ),
      ]),
    );
  }
}
