import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sahyadri_heights/api.dart';
import 'package:sahyadri_heights/modules_util.dart';
import 'package:sahyadri_heights/screens/services.dart';

void main() {
  test('IST dates: 22:00 UTC is already the next day in India', () {
    expect(istToday(DateTime.utc(2026, 11, 25, 22, 0)), '2026-11-26');
    expect(istToday(DateTime.utc(2026, 11, 25, 6, 30)), '2026-11-25');
    expect(addDays('2026-11-30', 1), '2026-12-01');
    expect(dayLabel('2026-11-26'), 'Thu 26 Nov');
  });

  test('rupees use Indian digit grouping', () {
    expect(rupees(2500), '₹2,500');
    expect(rupees(125000), '₹1,25,000');
    expect(rupees(10000000), '₹1,00,00,000');
    expect(rupees(1500.5), '₹1,500.50');
    expect(rupees(null), '₹0');
  });

  test('More menu follows the API rules per role', () {
    List<String> titles(String role) => serviceEntries(role).map((e) => e.title).toList();
    expect(titles('resident'), ['Amenities', 'Maintenance dues', 'Waste collection', 'Gate pass']);
    expect(titles('admin'), ['Amenities', 'Maintenance dues', 'Inventory', 'Waste', 'Gate desk']);
    expect(titles('staff'), ['Inventory', 'Waste']);
    expect(titles('guard'), isEmpty);
  });

  test('module calls send the bodies the server expects', () async {
    final seen = <String>[];
    final api = Api('http://x', client: MockClient((req) async {
      seen.add('${req.method} ${req.url.path}${req.url.query.isEmpty ? '' : '?${req.url.query}'} ${req.body}');
      final p = req.url.path;
      if (p == '/api/bookings' || p == '/api/waste/missed') return http.Response('{"id":11}', 201);
      if (p.endsWith('/payments')) return http.Response('{"id":1,"balance":1500}', 201);
      if (p.endsWith('/move')) return http.Response('{"id":3,"name":"Mop","quantity":2,"unit":"pcs","low":true}', 200);
      if (p == '/api/dues') return http.Response('{"dues":[],"totals":{}}', 200);
      return http.Response('{}', 200);
    }));
    expect(await api.book(4, '2026-11-26', '14:00'), 11);
    expect(await api.recordPayment(7, amount: 1000, method: 'upi', reference: 'R1'), 1500);
    expect((await api.moveStock(3, -2, note: 'job', requestId: 9))['low'], true);
    expect(await api.reportMissedPickup('dry'), 11);
    await api.dues(status: 'overdue');
    expect(seen[0], 'POST /api/bookings ${jsonEncode({'amenity_id': 4, 'date': '2026-11-26', 'start': '14:00'})}');
    expect(jsonDecode(seen[1].split(' ').sublist(2).join(' ')), {'amount': 1000, 'method': 'upi', 'reference': 'R1'});
    expect(jsonDecode(seen[2].split(' ').sublist(2).join(' ')), {'change': -2, 'note': 'job', 'request_id': 9});
    expect(seen[3], startsWith('POST /api/waste/missed'));
    expect(seen[4], startsWith('GET /api/dues?status=overdue'));
  });
}
