import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../theme.dart';
import 'amenities.dart';
import 'dues.dart';
import 'inventory.dart';
import 'gate_pass.dart';
import 'waste.dart';

typedef ServiceEntry = ({String title, String sub, IconData icon, Widget Function() page});

/// "More": extras beyond the required processes, by role (same rules as the API). Residents and the committee
/// get amenities, dues and waste; the committee and staff get inventory; staff get waste logs; residents get gate passes.
List<ServiceEntry> serviceEntries(String role) => [
      if (role == 'resident' || role == 'admin')
        (title: 'Amenities', sub: 'Book the clubhouse, gym and other spaces', icon: Icons.event_available_outlined, page: () => const AmenitiesScreen()),
      if (role == 'resident' || role == 'admin')
        (title: 'Maintenance dues', sub: role == 'admin' ? 'Raise bills, record payments' : 'Your flat\'s bills and payments', icon: Icons.receipt_long_outlined, page: () => const DuesScreen()),
      if (role == 'admin' || role == 'staff')
        (title: 'Inventory', sub: role == 'admin' ? 'Stock, reorder levels' : 'Take stock out for a job', icon: Icons.inventory_2_outlined, page: () => const InventoryScreen()),
      if (role == 'resident' || role == 'admin' || role == 'staff')
        (title: role == 'resident' ? 'Waste collection' : 'Waste', sub: role == 'resident' ? 'Pickup days, report a missed pickup' : 'Pickup days, log collections', icon: Icons.recycling, page: () => const WasteScreen()),
      if (role == 'resident')
        (title: 'Gate pass', sub: 'Visitor passes with a QR or code', icon: Icons.qr_code_2_outlined, page: () => const GatePassScreen()),
    ];

class ServicesScreen extends StatelessWidget {
  const ServicesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final entries = serviceEntries(app.role);
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: entries.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          final e = entries[i];
          return Card(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              leading: CircleAvatar(backgroundColor: Palette.accent100, child: Icon(e.icon, color: Palette.accent700)),
              title: Text(e.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
              subtitle: Text(e.sub),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => e.page())),
            ),
          );
        },
      ),
    );
  }
}
