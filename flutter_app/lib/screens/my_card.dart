import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../app_state.dart';
import '../card_wallet.dart';
import '../modules_util.dart';
import '../theme.dart';

/// "My card": the flat's prepaid wallet (balance and history), freeze or unfreeze the community card (for a lost card),
/// and recent card activity. Residents see the wallet; other roles see the freeze switch and activity only.
/// Contract: docs/card-wallet-api.md (`GET /api/wallet`, `GET /api/me/card`, `POST /api/me/card/freeze`).
class MyCardScreen extends StatefulWidget {
  const MyCardScreen({super.key, this.api, this.role});

  /// Tests pass a client with a mock backend; the app uses the signed-in session.
  final Api? api;
  final String? role;
  @override
  State<MyCardScreen> createState() => MyCardState();
}

class MyCardState extends State<MyCardScreen> {
  Map<String, dynamic>? card;
  Map<String, dynamic>? wallet;
  String err = '';
  bool busy = false;

  String get role => widget.role ?? app.role;
  Future<T> _run<T>(Future<T> Function(Api a) f) => widget.api != null ? f(widget.api!) : app.run(f);

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final c = await _run((a) => a.myCard());
      Map<String, dynamic>? w;
      if (role == 'resident') {
        try {
          w = await _run((a) => a.wallet());
        } on ApiException {
          w = null; // no flat yet: no wallet
        }
      }
      if (!mounted) return;
      setState(() {
        card = c;
        wallet = w;
        err = '';
      });
    } catch (e) {
      if (mounted) setState(() => err = '$e');
    }
  }

  /// Asks first: a frozen card is refused at the gate, the tuck shop, laundry and the parcel desk.
  Future<void> toggle(bool frozen) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(frozen ? 'Unfreeze your card?' : 'Freeze your card?'),
        content: Text(frozen
            ? 'It works at the gate, the tuck shop, laundry and the parcel desk again.'
            : 'It stops working at the gate, the tuck shop, laundry and the parcel desk until you unfreeze it.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(key: const Key('confirmFreeze'), onPressed: () => Navigator.pop(ctx, true), child: Text(frozen ? 'Yes, unfreeze' : 'Yes, freeze')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => busy = true);
    try {
      final now = await _run((a) => a.freezeCard(!frozen));
      if (!mounted) return;
      toast(context, now ? 'Card frozen. Nobody can use it until you unfreeze it.' : 'Card unfrozen');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
    await load();
  }

  @override
  Widget build(BuildContext context) {
    final c = card, w = wallet;
    final cards = (c?['cards'] as List?) ?? const [];
    final frozen = c?['frozen'] == true;
    final activity = (c?['activity'] as List?) ?? const [];
    final tx = (w?['tx'] as List?) ?? const [];
    final balance = asNum(w?['balance'] ?? (c?['wallet'] as Map?)?['balance']);
    final flat = w?['flat'] ?? app.user?['flat'];
    return Scaffold(
      appBar: AppBar(title: const Text('My community card')),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          if (err.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(err, style: const TextStyle(color: Palette.errorText, fontWeight: FontWeight.w600))),
          if (c == null && err.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('Loading…', textAlign: TextAlign.center, style: TextStyle(color: Colors.black54))),
          if (balance != null) ...[
            Card(
              key: const Key('wallet'),
              color: Palette.accent700,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(flat == null ? 'Wallet' : 'Wallet · Flat $flat', style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  Text(rupees(balance), style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  const Text('Shared by your flat. Pay at the tuck shop and laundry with your card. Top up with cash or UPI at the committee office.',
                      style: TextStyle(color: Colors.white70)),
                ]),
              ),
            ),
            const SizedBox(height: 12),
          ],
          if (c != null)
            Card(
              child: cards.isEmpty
                  ? const ListTile(
                      leading: Icon(Icons.badge_outlined),
                      title: Text('No community card yet'),
                      subtitle: Text('The guard at the gate desk registers one for you.'),
                    )
                  : SwitchListTile(
                      key: const Key('freeze'),
                      secondary: Icon(frozen ? Icons.ac_unit : Icons.badge_outlined, color: Palette.accent700),
                      title: Text(frozen ? 'Card frozen' : 'Card active', style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(frozen
                          ? 'Nobody can use it until you unfreeze it. Switch off to unfreeze.'
                          : 'Lost your card? Switch on to freeze it. ${cards.map((x) => 'Card ending ${_last4(x)}').join(', ')}'),
                      value: frozen,
                      onChanged: busy ? null : (_) => toggle(frozen),
                    ),
            ),
          if (w != null) ...[
            const SizedBox(height: 20),
            const Text('Wallet history', style: sectionStyle),
            if (tx.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('No wallet activity yet.', style: TextStyle(color: Colors.black54))),
            for (final t in tx)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(cardIcon('${t['kind']}'), color: Palette.accent700),
                title: Text(walletTxLabel(t as Map)),
                subtitle: Text([if (t['note'] != null && '${t['note']}'.isNotEmpty) '${t['note']}', shortDate(t['created_at'] as String?)].join(' · ')),
                trailing: Text(signedRupees(asNum(t['amount'])), style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
          ],
          if (c != null) ...[
            const SizedBox(height: 20),
            const Text('Card activity', style: sectionStyle),
            if (activity.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('Nothing yet.', style: TextStyle(color: Colors.black54))),
            for (final a in activity)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(cardIcon(a['icon'] as String?), color: Palette.accent700),
                title: Text('${a['text'] ?? ''}'),
                subtitle: Text([shortDate(a['at'] as String?), if (a['payment'] != null && a['kind'] != 'wallet') paymentLabel('${a['payment']}')].join(' · ')),
                trailing: a['amount'] == null
                    ? null
                    : Text(a['kind'] == 'wallet' ? signedRupees(asNum(a['amount'])) : rupees(asNum(a['amount'])), style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
          ],
        ]),
      ),
    );
  }

  static String _last4(dynamic card) {
    final s = '${(card as Map)['serial'] ?? ''}';
    return s.length <= 4 ? s : s.substring(s.length - 4);
  }
}
