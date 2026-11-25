import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

/// Error returned by the portal API ({"error": "..."}), with the HTTP status.
class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

/// Thin client for the frozen portal API contract (`public/api.js`).
///
/// The portal uses a session cookie, so this client captures `set-cookie`
/// on login and sends it back on every call. Native apps send no `Origin`
/// header, so the server's cross-origin guard does not block them.
class Api {
  Api(String baseUrl, {http.Client? client, this.cookie})
      : baseUrl = normalise(baseUrl),
        _client = client ?? http.Client();

  String baseUrl;
  String? cookie;
  final http.Client _client;

  static String normalise(String url) {
    var u = url.trim();
    if (u.isEmpty) return u;
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://$u';
    return u.replaceAll(RegExp(r'/+$'), '');
  }

  Uri uri(String path, [Map<String, String>? query]) {
    final u = Uri.parse('$baseUrl$path');
    return query == null ? u : u.replace(queryParameters: query);
  }

  Map<String, String> get _headers => {
        'accept': 'application/json',
        if (cookie != null) 'cookie': cookie!,
      };

  /// Keeps `name=value` pairs from one or more Set-Cookie headers
  /// (the http package joins several headers with commas).
  static String? parseSetCookie(String? header) {
    if (header == null || header.isEmpty) return null;
    final parts = header
        .split(RegExp(r',(?=\s*[A-Za-z0-9_.\-]+=)'))
        .map((c) => c.split(';').first.trim())
        .where((c) => c.contains('='))
        .toList();
    return parts.isEmpty ? null : parts.join('; ');
  }

  dynamic _decode(http.Response res) {
    final fresh = parseSetCookie(res.headers['set-cookie']);
    if (fresh != null) cookie = fresh;
    dynamic body;
    if (res.body.isNotEmpty) {
      try {
        body = jsonDecode(res.body);
      } catch (_) {
        body = null;
      }
    }
    if (res.statusCode >= 400) {
      final msg = body is Map && body['error'] is String
          ? body['error'] as String
          : 'Request failed (${res.statusCode})';
      throw ApiException(res.statusCode, msg);
    }
    return body;
  }

  /// The free Render plan sleeps and takes about 50 seconds to wake up.
  static const timeout = Duration(seconds: 75);

  /// Network failures become one readable message instead of a socket error.
  Future<http.Response> _net(Future<http.Response> Function() f) async {
    try {
      return await f().timeout(timeout);
    } on TimeoutException {
      throw ApiException(0, 'The server is taking too long to answer. Try again in a minute.');
    } on http.ClientException {
      throw ApiException(0, 'Cannot reach the server. Check your connection and the server address.');
    }
  }

  Future<dynamic> get(String path, [Map<String, String>? query]) async =>
      _decode(await _net(() => _client.get(uri(path, query), headers: _headers)));

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async =>
      _decode(await _net(() => _client.post(uri(path),
          headers: {..._headers, 'content-type': 'application/json'},
          body: jsonEncode(body ?? {}))));

  // ---- auth
  Future<Map<String, dynamic>> login(String email, String password) async {
    cookie = null;
    final u = await post('/api/login', {'email': email, 'password': password});
    return Map<String, dynamic>.from(u as Map);
  }

  Future<Map<String, dynamic>> me() async =>
      Map<String, dynamic>.from(await get('/api/me') as Map);

  Future<void> logout() async {
    try {
      await post('/api/logout');
    } finally {
      cookie = null;
    }
  }

  // ---- requests
  Future<List<dynamic>> requests({String? status}) async =>
      await get('/api/requests', status == null ? null : {'status': status})
          as List<dynamic>;

  Future<Map<String, dynamic>> request(int id) async =>
      Map<String, dynamic>.from(await get('/api/requests/$id') as Map);

  Future<List<dynamic>> comments(int id) async =>
      await get('/api/requests/$id/comments') as List<dynamic>;

  Future<void> addComment(int id, String body) =>
      post('/api/requests/$id/comments', {'body': body});

  // ---- committee: assignment (vendor or society staff; either lets the request move forward)
  Future<List<dynamic>> vendors() async => await get('/api/vendors') as List<dynamic>;

  Future<List<dynamic>> staff() async => await get('/api/admin/staff') as List<dynamic>;

  Future<void> assign(int id, {int? vendorId, int? staffId}) {
    assert((vendorId == null) != (staffId == null), 'assign a vendor or a staff member');
    return post('/api/requests/$id/assign', staffId != null ? {'staff_id': staffId} : {'vendor_id': vendorId});
  }

  Future<void> setStatus(int id, String status) =>
      post('/api/requests/$id/status', {'status': status});

  /// Multipart, because the web form also sends an optional photo.
  Future<int> createRequest({
    required String category,
    required String title,
    String description = '',
    List<int>? photoBytes,
    String? photoName,
  }) async {
    final req = http.MultipartRequest('POST', uri('/api/requests'))
      ..headers.addAll(_headers)
      ..fields['category'] = category
      ..fields['title'] = title
      ..fields['description'] = description;
    if (photoBytes != null) {
      final name = photoName ?? 'photo.jpg';
      final lower = name.toLowerCase();
      final type = lower.endsWith('.png')
          ? MediaType('image', 'png')
          : lower.endsWith('.webp')
              ? MediaType('image', 'webp')
              : MediaType('image', 'jpeg');
      req.files.add(http.MultipartFile.fromBytes('photo', photoBytes,
          filename: name, contentType: type));
    }
    final res = await _net(() async => http.Response.fromStream(await _client.send(req)));
    final body = _decode(res);
    return (body as Map)['id'] as int;
  }

  // ---- community
  Future<List<dynamic>> notices() async =>
      await get('/api/notices') as List<dynamic>;

  Future<List<dynamic>> emergencies() async =>
      await get('/api/emergencies') as List<dynamic>;

  Future<int> raiseEmergency(String type, String note) async {
    final r = await post('/api/emergencies', {'type': type, 'note': note});
    return (r as Map)['id'] as int;
  }

  Future<List<dynamic>> notifications() async =>
      await get('/api/notifications') as List<dynamic>;

  Future<void> markNotificationsRead() => post('/api/notifications/read');

  /// Resident's personal gate token: `{token, qr: "HSP:<token>", nfc}`.
  Future<Map<String, dynamic>> gatePass() async =>
      Map<String, dynamic>.from(await get('/api/gate/me') as Map);
}
