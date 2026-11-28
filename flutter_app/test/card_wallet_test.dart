import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:sahyadri_heights/api.dart';
import 'package:sahyadri_heights/card_wallet.dart';
import 'package:sahyadri_heights/screens/counter.dart';
import 'package:sahyadri_heights/screens/my_card.dart';
import 'package:sahyadri_heights/theme.dart';

/// Community card wallet (docs/card-wallet-api.md). Synthetic data only.
typedef Seen = List<(String method, String path, Object? body)>;

Api mockApi(Seen seen, http.Response Function(String method, String path, Object? body) reply) => Api('http://x', client: MockClient((req) async {
      final body = req.body.isEmpty ? null : jsonDecode(req.body);
      seen.add((req.method, req.url.path, body));
      return reply(req.method, req.url.path, body);
    }));

http.Response jsonRes(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
}

void bigScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

void main() {
  test('every card wallet route sends the contract body', () async {
    final seen = <(String, String, Object?)>[];
    final api = mockApi(seen, (m, p, b) {
      if (p == '/api/wallet' || p.startsWith('/api/admin/wallets/')) return jsonRes({'flat': 'A-101', 'balance': 250, 'tx': []});
      if (p == '/api/admin/wallets') return jsonRes([{'flat': 'A-101', 'balance': 250, 'last_at': null}]);
      if (p == '/api/admin/wallet/topup') return jsonRes({'flat': 'A-101', 'balance': 750, 'tx_id': 3}, 201);
      if (p == '/api/admin/wallet/adjust') return jsonRes({'flat': 'A-101', 'balance': 700}, 201);
      if (p == '/api/card/lookup' || p == '/api/shop/card') return jsonRes({'id': 7, 'name': 'Test Resident', 'role': 'resident', 'flat': 'A-101', 'frozen': false, 'wallet': {'balance': 250}});
      if (p == '/api/shop/counter' || p == '/api/laundry/counter' || p == '/api/shop/orders' || p == '/api/laundry/orders') return jsonRes({'id': 12, 'total': 60, 'payment': 'wallet'}, 201);
      if (p.startsWith('/api/parcels/card/')) return jsonRes([{'id': 4, 'flat': 'A-101', 'carrier': 'Courier'}]);
      if (p.startsWith('/api/events/') && p.endsWith('/checkin')) return jsonRes({'name': 'Test Resident', 'flat': 'A-101', 'rsvp': true, 'already': false}, 201);
      if (p.endsWith('/checkins')) return jsonRes([]);
      if (p == '/api/me/card') return jsonRes({'cards': [], 'frozen': false, 'wallet': null, 'activity': []});
      if (p == '/api/me/card/freeze') return jsonRes({'frozen': true});
      return jsonRes({'ok': true});
    });
    expect((await api.wallet())['balance'], 250);
    expect((await api.adminWallets()).single['flat'], 'A-101');
    await api.adminWallet('A-101');
    expect((await api.topUpWallet(serial: '04A1B2C3', amount: 500, method: 'upi', reference: 'U1'))['balance'], 750);
    expect((await api.adjustWallet('A-101', -50, 'Correction'))['balance'], 700);
    expect((await api.cardLookup('04A1B2C3'))['name'], 'Test Resident');
    await api.shopCard('04A1B2C3');
    await api.shopOrder({1: 2}, payment: 'wallet', fulfilment: 'pickup');
    expect((await api.shopCounter('04A1B2C3', {1: 2, 3: 0}, 'wallet'))['id'], 12);
    await api.laundryOrder(pickupDate: '2026-11-28', pickupSlot: 'morning', qty: {5: 3}, payment: 'wallet');
    await api.laundryCounter('04A1B2C3', {5: 3}, 'cash');
    expect((await api.parcelsForCard('04A1B2C3')).single['id'], 4);
    await api.collectParcel(4, serial: '04A1B2C3');
    expect((await api.eventCheckin(9, '04A1B2C3'))['rsvp'], true);
    await api.eventCheckins(9);
    expect((await api.myCard())['frozen'], false);
    expect(await api.freezeCard(true), true);

    final calls = [for (final s in seen) '${s.$1} ${s.$2}'];
    expect(calls, [
      'GET /api/wallet',
      'GET /api/admin/wallets',
      'GET /api/admin/wallets/A-101',
      'POST /api/admin/wallet/topup',
      'POST /api/admin/wallet/adjust',
      'POST /api/card/lookup',
      'POST /api/shop/card',
      'POST /api/shop/orders',
      'POST /api/shop/counter',
      'POST /api/laundry/orders',
      'POST /api/laundry/counter',
      'GET /api/parcels/card/04A1B2C3',
      'POST /api/parcels/4/collect',
      'POST /api/events/9/checkin',
      'GET /api/events/9/checkins',
      'GET /api/me/card',
      'POST /api/me/card/freeze',
    ]);
    Object? body(String call) => seen.firstWhere((s) => '${s.$1} ${s.$2}' == call).$3;
    expect(body('POST /api/admin/wallet/topup'), {'serial': '04A1B2C3', 'amount': 500, 'method': 'upi', 'reference': 'U1'});
    expect(body('POST /api/admin/wallet/adjust'), {'flat': 'A-101', 'amount': -50, 'note': 'Correction'});
    expect(body('POST /api/shop/orders'), {'items': [{'id': 1, 'qty': 2}], 'payment': 'wallet', 'fulfilment': 'pickup'});
    expect(body('POST /api/shop/counter'), {'serial': '04A1B2C3', 'items': [{'id': 1, 'qty': 2}], 'payment': 'wallet'}); // qty 0 dropped
    expect(body('POST /api/laundry/orders'), {'pickup_date': '2026-11-28', 'pickup_slot': 'morning', 'items': [{'id': 5, 'qty': 3}], 'payment': 'wallet'});
    expect(body('POST /api/laundry/counter'), {'serial': '04A1B2C3', 'lines': [{'item': 5, 'id': 5, 'qty': 3}], 'payment': 'cash'});
    expect(body('POST /api/parcels/4/collect'), {'serial': '04A1B2C3'});
    expect(body('POST /api/events/9/checkin'), {'serial': '04A1B2C3'});
    expect(body('POST /api/me/card/freeze'), {'frozen': true});
  });

  test('a frozen card error keeps the server message', () async {
    const msg = 'This card is frozen. Its owner can unfreeze it under Profile > My community card.';
    final api = Api('http://x', client: MockClient((_) async => http.Response(jsonEncode({'error': msg}), 403)));
    expect(() => api.cardLookup('04A1B2C3'), throwsA(isA<ApiException>().having((e) => e.status, 'status', 403).having((e) => e.message, 'message', msg)));
  });

  test('wallet labels use the web wording', () {
    expect(walletTxLabel({'kind': 'topup', 'method': 'upi'}), 'Top-up (UPI)');
    expect(walletTxLabel({'kind': 'topup', 'method': 'cash'}), 'Top-up (Cash)');
    expect(walletTxLabel({'kind': 'shop', 'method': null}), 'Tuck shop');
    expect(walletTxLabel({'kind': 'refund'}), 'Refund');
    expect(signedRupees(500), '+₹500');
    expect(signedRupees(-120.5), '−₹120.50');
    expect(paymentLabel('wallet'), 'Wallet');
    expect(paymentLabel('account'), 'Maintenance account');
    expect(payments.map((p) => p.$1).toList(), ['cash', 'upi', 'wallet', 'account']);
  });

  testWidgets('shop counter: tap card, see the wallet, sell two items, pay by wallet', (tester) async {
    bigScreen(tester);
    final seen = <(String, String, Object?)>[];
    final api = mockApi(seen, (m, p, b) {
      if (p == '/api/shop/items') {
        return jsonRes([
          {'id': 1, 'name': 'Milk', 'category': 'dairy', 'price': 30, 'stock': 5, 'unit': 'pack', 'active': true},
          {'id': 2, 'name': 'Bread', 'category': 'groceries', 'price': 45, 'stock': 0, 'active': true},
        ]);
      }
      if (p == '/api/card/lookup') {
        return jsonRes({'id': 7, 'name': 'Test Resident', 'role': 'resident', 'flat': 'A-101', 'frozen': false, 'wallet': {'balance': 100}, 'credit': {'used': 0, 'limit': 2000}, 'parcels_waiting': null});
      }
      if (p == '/api/shop/counter') return jsonRes({'id': 12, 'total': 60, 'payment': 'wallet', 'name': 'Test Resident', 'flat': 'A-101'}, 201);
      return jsonRes({});
    });
    await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: CounterScreen(nfc: false, api: api, role: 'shop')));
    await settle(tester);
    expect(find.text('Tuck shop counter'), findsOneWidget);
    expect(find.text('Tap the resident’s card'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('serial')), '04:a1:b2:c3'); // a USB reader types the number
    await tester.testTextInput.receiveAction(TextInputAction.go);
    await settle(tester);
    expect(seen.last.$3, {'serial': '04A1B2C3'});
    expect(find.text('Test Resident'), findsOneWidget);
    expect(find.text('Wallet ₹100'), findsOneWidget);
    expect(find.text('Milk'), findsOneWidget);
    expect(find.text('Bread'), findsNothing); // out of stock

    await tester.tap(find.byKey(const Key('add-1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('add-1')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('total'))).data, '₹60');
    await tester.tap(find.byKey(const Key('pay-wallet')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('charge')));
    await settle(tester);
    final sale = seen.firstWhere((s) => s.$2 == '/api/shop/counter');
    expect(sale.$3, {'serial': '04A1B2C3', 'items': [{'id': 1, 'qty': 2}], 'payment': 'wallet'});
    expect(find.byKey(const Key('done')), findsOneWidget);
    expect(find.text('₹60 from Test Resident, Flat A-101'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5)); // let the snack bar go
  });

  testWidgets('laundry counter refuses a frozen card with the server message', (tester) async {
    bigScreen(tester);
    const msg = 'This card is frozen. Its owner can unfreeze it under Profile > My community card.';
    final api = mockApi(<(String, String, Object?)>[], (m, p, b) {
      if (p == '/api/laundry/rates') return jsonRes([{'id': 5, 'item': 'Shirt', 'price': 20, 'active': true}]);
      if (p == '/api/card/lookup') return http.Response(jsonEncode({'error': msg}), 403);
      return jsonRes({});
    });
    await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: CounterScreen(nfc: false, api: api, role: 'laundry')));
    await settle(tester);
    expect(find.text('Laundry counter'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('serial')), '04A1B2C3');
    await tester.testTextInput.receiveAction(TextInputAction.go);
    await settle(tester);
    expect(find.text(msg), findsOneWidget);
    expect(find.byKey(const Key('holder')), findsNothing);
  });

  testWidgets('My card: wallet, history, and freeze after a confirm', (tester) async {
    bigScreen(tester);
    var frozen = false;
    final seen = <(String, String, Object?)>[];
    final api = mockApi(seen, (m, p, b) {
      if (p == '/api/me/card') {
        return jsonRes({
          'cards': [{'id': 1, 'serial': '04A1B2C3', 'created_at': '2026-11-20 05:00:00'}],
          'frozen': frozen,
          'wallet': {'balance': 450},
          'activity': [{'at': '2026-11-27 05:00:00', 'kind': 'wallet', 'icon': 'wallet', 'text': 'Paid at the tuck shop', 'amount': -50}],
        });
      }
      if (p == '/api/wallet') {
        return jsonRes({'flat': 'A-101', 'balance': 450, 'tx': [{'id': 2, 'amount': -50, 'kind': 'shop', 'method': null, 'note': null, 'created_at': '2026-11-27 05:00:00'}, {'id': 1, 'amount': 500, 'kind': 'topup', 'method': 'upi', 'note': null, 'created_at': '2026-11-26 05:00:00'}]});
      }
      if (p == '/api/me/card/freeze') {
        frozen = (b as Map)['frozen'] == true;
        return jsonRes({'frozen': frozen});
      }
      return jsonRes({});
    });
    await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: MyCardScreen(api: api, role: 'resident')));
    await settle(tester);
    expect(find.text('₹450'), findsOneWidget);
    expect(find.text('Top-up (UPI)'), findsOneWidget);
    expect(find.text('+₹500'), findsOneWidget);
    expect(find.text('Paid at the tuck shop'), findsOneWidget);
    expect(find.text('Card active'), findsOneWidget);

    await tester.tap(find.byKey(const Key('freeze')));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Freeze your card?'), findsOneWidget);
    expect(seen.where((s) => s.$2 == '/api/me/card/freeze'), isEmpty); // nothing happens before the confirm
    await tester.tap(find.byKey(const Key('confirmFreeze')));
    await tester.pump(const Duration(milliseconds: 400));
    await settle(tester);
    expect(seen.firstWhere((s) => s.$2 == '/api/me/card/freeze').$3, {'frozen': true});
    expect(find.text('Card frozen'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });
}
