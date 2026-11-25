import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../theme.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final u = app.user ?? const {};
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: Palette.badge,
                child: Text(((u['name'] as String?) ?? '?').substring(0, 1).toUpperCase(),
                    style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u['name'] ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                  Text(u['email'] ?? '', style: const TextStyle(color: Colors.black54)),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Column(children: [
            if (u['flat'] != null)
              ListTile(leading: const Icon(Icons.apartment), title: const Text('Flat'), trailing: Text('${u['flat']}')),
            if (u['phone'] != null)
              ListTile(leading: const Icon(Icons.phone_outlined), title: const Text('Phone'), trailing: Text('${u['phone']}')),
            ListTile(leading: const Icon(Icons.badge_outlined), title: const Text('Role'), trailing: Text('${u['role']}')),
            ListTile(
                leading: const Icon(Icons.dns_outlined),
                title: const Text('Server'),
                subtitle: Text(app.api.baseUrl)),
          ]),
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: () => app.signOut(),
          icon: const Icon(Icons.logout),
          label: const Text('Sign out'),
        ),
      ]),
    );
  }
}
