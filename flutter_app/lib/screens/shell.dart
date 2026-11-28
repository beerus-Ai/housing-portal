import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import 'counter.dart';
import 'gate_desk.dart';
import 'home.dart';
import 'profile.dart';
import 'requests.dart';
import 'notices.dart';
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
    // Required items get their own tab (requests, notices); extras (amenities, dues, inventory, waste,
    // gate pass) sit under More, as in the Requirements Document. The bar holds at most 5 tabs.
    // Guards: the gate desk (tap NFC cards to check people in and out, register new cards), as on the web.
    if (role == 'guard') {
      tabs.add((label: 'Gate desk', icon: Icons.contactless_outlined, selected: Icons.contactless, page: const GateDeskScreen()));
    }
    // Tuck shop owner and laundry service: the card counter (tap a resident card, sell or take clothes in, pay).
    if (role == 'shop' || role == 'laundry') {
      tabs.add((label: 'Counter', icon: Icons.point_of_sale_outlined, selected: Icons.point_of_sale, page: const CounterScreen()));
    }
    if (role == 'resident' || role == 'admin') {
      tabs.add((label: 'Notices', icon: Icons.campaign_outlined, selected: Icons.campaign, page: const NoticesScreen()));
    }
    if (role == 'resident' || role == 'admin' || role == 'staff') {
      tabs.add((label: 'More', icon: Icons.apps_outlined, selected: Icons.apps, page: const ServicesScreen()));
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
