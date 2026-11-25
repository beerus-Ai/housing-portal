import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import 'gate_pass.dart';
import 'home.dart';
import 'profile.dart';
import 'requests.dart';
import 'services.dart';

typedef _Tab = ({String label, IconData icon, IconData selected, Widget page});

/// Bottom navigation bar; the tabs depend on the role (same rules as the API).
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _index = 0;

  List<_Tab> _tabs() {
    final role = app.role;
    final tabs = <_Tab>[
      (label: 'Home', icon: Icons.home_outlined, selected: Icons.home, page: const HomeScreen()),
    ];
    if (role == 'resident' || role == 'admin' || role == 'staff') {
      tabs.add((
        label: role == 'staff' ? 'My jobs' : 'Requests',
        icon: Icons.build_outlined,
        selected: Icons.build,
        page: const RequestsScreen()
      ));
    }
    // Amenities, dues, inventory, waste and notices live under one tab (the bar holds at most 5).
    if (role == 'resident' || role == 'admin' || role == 'staff') {
      tabs.add((label: 'Services', icon: Icons.storefront_outlined, selected: Icons.storefront, page: const ServicesScreen()));
    }
    if (role == 'resident') {
      tabs.add((label: 'Gate pass', icon: Icons.qr_code_2_outlined, selected: Icons.qr_code_2, page: const GatePassScreen()));
    }
    tabs.add((label: 'Profile', icon: Icons.person_outline, selected: Icons.person, page: const ProfileScreen()));
    return tabs;
  }

  @override
  Widget build(BuildContext context) {
    final tabs = _tabs();
    final i = _index.clamp(0, tabs.length - 1);
    return Scaffold(
      body: IndexedStack(index: i, children: [for (final t in tabs) t.page]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: i,
        onDestinationSelected: (v) => setState(() => _index = v),
        destinations: [
          for (final t in tabs)
            NavigationDestination(icon: Icon(t.icon), selectedIcon: Icon(t.selected), label: t.label),
        ],
      ),
    );
  }
}
