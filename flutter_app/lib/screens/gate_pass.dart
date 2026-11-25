import 'package:material_ui/material_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../app_state.dart';
import '../theme.dart';

/// The resident's personal gate QR (`HSP:<token>`), scanned by the guard app.
class GatePassScreen extends StatefulWidget {
  const GatePassScreen({super.key});
  @override
  State<GatePassScreen> createState() => _GatePassScreenState();
}

class _GatePassScreenState extends State<GatePassScreen> {
  late Future<Map<String, dynamic>> _future = app.run((a) => a.gatePass());

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Gate pass')),
        body: FutureBuilder<Map<String, dynamic>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                EmptyState(Icons.qr_code_2, '${snap.error}'),
                TextButton(
                    onPressed: () => setState(() => _future = app.run((a) => a.gatePass())),
                    child: const Text('Retry')),
              ]);
            }
            final qr = snap.data!['qr'] as String;
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: QrImageView(data: qr, version: QrVersions.auto, size: 240),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('Flat ${app.user?['flat'] ?? ''}',
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  const Text('Show this at the gate. The guard scans it to let you in.',
                      textAlign: TextAlign.center, style: TextStyle(color: Colors.black54)),
                ]),
              ),
            );
          },
        ),
      );
}
