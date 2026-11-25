import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  late final _server = TextEditingController(text: app.api.baseUrl);
  bool _busy = false, _showServer = false;
  String? _error;

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await app.signIn(_server.text, _email.text.trim(), _password.text);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Icon(Icons.apartment_rounded, size: 72, color: Palette.accent),
                  const SizedBox(height: 12),
                  const Text('Sahyadri Heights',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 32),
                  TextField(
                    key: const Key('email'),
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(labelText: 'Email'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const Key('password'),
                    controller: _password,
                    obscureText: true,
                    onSubmitted: (_) => _submit(),
                    decoration: const InputDecoration(labelText: 'Password'),
                  ),
                  if (_showServer) ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: _server,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(
                          labelText: 'Server', helperText: 'Local test: http://localhost:3000 with adb reverse'),
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, key: const Key('error'), style: const TextStyle(color: Palette.emRed)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    key: const Key('signin'),
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                        : const Text('Sign in'),
                  ),
                  TextButton(
                    onPressed: () => setState(() => _showServer = !_showServer),
                    child: Text(_showServer ? 'Hide server' : 'Server settings'),
                  ),
                ]),
              ),
            ),
          ),
        ),
      );
}
