import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

const defaultServer = 'https://sahyadri-heights.onrender.com';

/// App-wide state: the API client and the signed-in user.
/// The session cookie and server URL are kept on the device so the
/// resident stays signed in between launches (the server session lasts 8h).
class AppState extends ChangeNotifier {
  AppState({Api? api}) : api = api ?? Api(defaultServer);

  final Api api;
  Map<String, dynamic>? user;
  bool restoring = true;

  String get role => (user?['role'] as String?) ?? '';
  bool get isAdmin => role == 'admin';
  bool get isResident => role == 'resident';
  List<String> get permissions =>
      ((user?['permissions'] as List?) ?? const []).cast<String>();
  bool can(String key) => isAdmin || permissions.contains(key);

  Future<void> restore() async {
    try {
      final p = await SharedPreferences.getInstance();
      api.baseUrl = Api.normalise(p.getString('server') ?? defaultServer);
      api.cookie = p.getString('cookie');
      if (api.cookie != null) user = await api.me();
    } catch (_) {
      user = null;
      api.cookie = null;
    }
    restoring = false;
    notifyListeners();
  }

  Future<void> signIn(String server, String email, String password) async {
    api.baseUrl = Api.normalise(server);
    await api.login(email, password);
    user = await api.me(); // includes permissions and feature switches
    final p = await SharedPreferences.getInstance();
    await p.setString('server', api.baseUrl);
    if (api.cookie != null) await p.setString('cookie', api.cookie!);
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await api.logout();
    } catch (_) {/* already signed out on the server */}
    final p = await SharedPreferences.getInstance();
    await p.remove('cookie');
    user = null;
    notifyListeners();
  }

  /// Runs an API call; a 401 signs the app out (session expired).
  Future<T> run<T>(Future<T> Function(Api api) f) async {
    try {
      return await f(api);
    } on ApiException catch (e) {
      if (e.status == 401 && user != null) await expired();
      rethrow;
    }
  }

  /// Called when any API call returns 401 (session expired or server restarted).
  Future<void> expired() async {
    final p = await SharedPreferences.getInstance();
    await p.remove('cookie');
    api.cookie = null;
    user = null;
    notifyListeners();
  }
}

final app = AppState();
