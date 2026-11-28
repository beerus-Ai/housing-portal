/// Labels and icons for the community card wallet (docs/card-wallet-api.md), same wording as the web and `/m/`.
library;

import 'package:material_ui/material_ui.dart';

import 'modules_util.dart';

/// Ways to pay at a counter or for an order, in the order the screens show them.
const payments = <(String, String)>[('cash', 'Cash'), ('upi', 'UPI'), ('wallet', 'Wallet'), ('account', 'Maintenance account')];

String paymentLabel(String? k) => payments.firstWhere((p) => p.$1 == k, orElse: () => (k ?? '', (k ?? '').toUpperCase())).$2;

/// Wallet ledger kinds: topup, shop, laundry, refund, adjust. Top-ups add the method: "Top-up (UPI)".
String walletTxLabel(Map<dynamic, dynamic> t) {
  final kind = switch (t['kind']) {
    'topup' => 'Top-up',
    'shop' => 'Tuck shop',
    'laundry' => 'Laundry',
    'refund' => 'Refund',
    'adjust' => 'Adjustment',
    final k => '${k ?? ''}',
  };
  final m = t['method'];
  return m == null || '$m'.isEmpty ? kind : '$kind (${m == 'upi' ? 'UPI' : m == 'cash' ? 'Cash' : m})';
}

/// Money in shows "+₹500", money out "−₹120".
String signedRupees(num? n) {
  final v = n ?? 0;
  return '${v < 0 ? '−' : '+'}${rupees(v.abs())}';
}

num? asNum(dynamic v) => v is num ? v : num.tryParse('${v ?? ''}');

/// The API sends Phosphor icon names (`sign-in`, `shopping-bag`, `wallet`, ...); these are the Material equivalents.
IconData cardIcon(String? name) => switch (name) {
      'sign-in' => Icons.login,
      'sign-out' => Icons.logout,
      'shopping-bag' => Icons.shopping_bag_outlined,
      't-shirt' => Icons.local_laundry_service_outlined,
      'receipt' => Icons.receipt_long_outlined,
      'calendar-check' => Icons.event_available_outlined,
      'clock-user' => Icons.schedule,
      'wallet' => Icons.account_balance_wallet_outlined,
      'topup' => Icons.savings_outlined,
      'shop' => Icons.shopping_bag_outlined,
      'laundry' => Icons.local_laundry_service_outlined,
      'refund' => Icons.undo,
      'adjust' => Icons.tune,
      _ => Icons.history,
    };
