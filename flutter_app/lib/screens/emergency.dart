import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../theme.dart';

const emergencyTypes = <(String, String, IconData)>[
  ('fire', 'Fire', Icons.local_fire_department_outlined),
  ('medical', 'Medical', Icons.medical_services_outlined),
  ('lift', 'Stuck in lift', Icons.elevator_outlined),
  ('theft', 'Theft', Icons.no_backpack_outlined),
  ('threat', 'Threat', Icons.report_outlined),
  ('violence', 'Violence', Icons.front_hand_outlined),
  ('other', 'Other', Icons.warning_amber_outlined),
];

/// Raises an emergency: the committee is alerted at once (and by email, via the n8n email desk).
class EmergencyScreen extends StatefulWidget {
  const EmergencyScreen({super.key});
  @override
  State<EmergencyScreen> createState() => _EmergencyScreenState();
}

class _EmergencyScreenState extends State<EmergencyScreen> {
  String? _type;
  final _note = TextEditingController();
  bool _busy = false;

  Future<void> _raise() async {
    if (_type == null) {
      toast(context, 'Choose what is happening', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await app.run((a) => a.raiseEmergency(_type!, _note.text.trim()));
      if (!mounted) return;
      toast(context, 'Alert sent. The committee and security have been notified.');
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Emergency')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 2.2,
            children: [
              for (final t in emergencyTypes)
                Card(
                  color: _type == t.$1 ? Palette.emRed : Palette.surface,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => setState(() => _type = t.$1),
                    child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(t.$3, color: _type == t.$1 ? Colors.white : Palette.emRed),
                      const SizedBox(width: 8),
                      Text(t.$2,
                          style: TextStyle(
                              fontWeight: FontWeight.w600, color: _type == t.$1 ? Colors.white : Palette.text)),
                    ]),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _note,
            maxLength: 500,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Anything the responders should know (optional)'),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: Palette.emRed),
            onPressed: _busy ? null : _raise,
            icon: const Icon(Icons.sos),
            label: const Text('Send emergency alert'),
          ),
        ]),
      );
}
