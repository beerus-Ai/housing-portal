import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sahyadri_heights/api.dart';

void main() {
  test('normalise adds https and trims trailing slashes', () {
    expect(Api.normalise('sahyadri-heights.onrender.com/'), 'https://sahyadri-heights.onrender.com');
    expect(Api.normalise('http://localhost:3000//'), 'http://localhost:3000');
  });

  test('parseSetCookie keeps name=value pairs only', () {
    expect(Api.parseSetCookie('connect.sid=s%3Aabc.def; Path=/; Expires=Wed, 26 Nov 2026 10:00:00 GMT; HttpOnly'),
        'connect.sid=s%3Aabc.def');
    expect(Api.parseSetCookie('a=1; Path=/, b=2; HttpOnly'), 'a=1; b=2');
    expect(Api.parseSetCookie(null), isNull);
  });

  test('login stores the session cookie and sends it on later calls', () async {
    final seen = <String?>[];
    final client = MockClient((req) async {
      seen.add(req.headers['cookie']);
      if (req.url.path == '/api/login') {
        expect(jsonDecode(req.body), {'email': 'owner1@sahyadri.test', 'password': 'pw'});
        return http.Response(jsonEncode({'id': 2, 'role': 'resident'}), 200,
            headers: {'set-cookie': 'connect.sid=xyz; Path=/; HttpOnly'});
      }
      return http.Response(jsonEncode([{'id': 1, 'title': 'Tap leaks', 'status': 'open'}]), 200);
    });
    final api = Api('http://localhost:3000', client: client);
    final u = await api.login('owner1@sahyadri.test', 'pw');
    expect(u['role'], 'resident');
    final list = await api.requests(status: 'open');
    expect(list.single['title'], 'Tap leaks');
    expect(seen, [null, 'connect.sid=xyz']);
  });

  test('API errors surface the server message and status', () async {
    final api = Api('http://x', client: MockClient((_) async => http.Response('{"error":"Invalid email or password"}', 401)));
    expect(
        () => api.login('a@b.c', 'bad'),
        throwsA(isA<ApiException>()
            .having((e) => e.status, 'status', 401)
            .having((e) => e.message, 'message', 'Invalid email or password')));
  });

  test('createRequest sends multipart with category, title and photo type', () async {
    late http.BaseRequest sent;
    late String body;
    final client = MockClient.streaming((req, stream) async {
      sent = req;
      body = utf8.decode(await stream.toBytes(), allowMalformed: true);
      return http.StreamedResponse(Stream.value(utf8.encode('{"id":7}')), 201);
    });
    final api = Api('http://x', client: client, cookie: 'connect.sid=1');
    final id = await api.createRequest(
        category: 'plumbing', title: 'Leak', photoBytes: [0xFF, 0xD8, 0xFF], photoName: 'p.jpg');
    expect(id, 7);
    expect(sent.headers['cookie'], 'connect.sid=1');
    expect(body, contains('name="category"'));
    expect(body, contains('plumbing'));
    expect(body, contains('content-type: image/jpeg'));
  });

  test('network failure becomes a readable message', () async {
    final api = Api('http://x', client: MockClient((_) async => throw http.ClientException('Failed host lookup')));
    expect(() => api.me(), throwsA(isA<ApiException>().having((e) => e.message, 'message', startsWith('Cannot reach the server'))));
  });
}
