/// Card numbers for the gate desk (docs/nfc-api.md). The server stores upper-case hex without separators, the same
/// value Web NFC reports as `serialNumber` (`04:a1:b2` = `04A1B2`), so the web and the app see one card the same way.
library;

/// Same rule as `normSerial` in `nfc.js`: separators (space : - .) are dropped; anything else that is not hex
/// makes the number invalid (empty string), so a typo never matches someone else's card.
String normSerial(String? s) {
  final v = (s ?? '').toUpperCase().replaceAll(RegExp(r'[\s:.\-]'), '');
  return RegExp(r'^[0-9A-F]*$').hasMatch(v) ? v : '';
}

String hexOf(List<int> bytes) => bytes.map((b) => (b & 0xFF).toRadixString(16).padLeft(2, '0')).join().toUpperCase();

/// The card's serial (UID) from an `nfc_manager` tag. Android puts it under each tech (`nfca`, `mifareclassic`,
/// `isodep`, `ndef`, ...) as `identifier`; iOS under `mifare`, `iso7816`, `iso15693` or `felica`. Empty if none.
String serialFromTagData(Map<dynamic, dynamic> data) {
  const order = ['nfca', 'mifareclassic', 'mifareultralight', 'isodep', 'nfcb', 'nfcf', 'nfcv', 'ndef', 'mifare', 'iso7816', 'iso15693', 'felica'];
  final keys = [...order.where(data.containsKey), ...data.keys.where((k) => !order.contains(k))];
  for (final k in keys) {
    final tech = data[k];
    if (tech is! Map) continue;
    final id = tech['identifier'] ?? tech['currentIDm'];
    if (id is List && id.isNotEmpty) return hexOf(id.cast<int>());
  }
  return '';
}

/// "Flat A-101", "Cleaning staff", "Tuck shop" ... for one person row (same wording as the web gate desk).
String personSub(Map<String, dynamic> p) {
  if (p['flat'] != null && '${p['flat']}'.isNotEmpty) return 'Flat ${p['flat']}';
  return switch (p['role']) {
    'staff' => p['department'] == 'cleaning' ? 'Cleaning staff' : 'Maintenance staff',
    'shop' => 'Tuck shop',
    'laundry' => 'Laundry',
    final r => '${r ?? ''}',
  };
}
