import 'package:material_ui/material_ui.dart';

import '../app_state.dart';
import '../modules_util.dart';
import '../theme.dart';

/// Residents book a slot; the committee sees every booking and can cancel.
/// Adding amenities and opening hours is done on the web dashboard.
class AmenitiesScreen extends StatefulWidget {
  const AmenitiesScreen({super.key});
  @override
  State<AmenitiesScreen> createState() => _AmenitiesScreenState();
}

class _AmenitiesScreenState extends State<AmenitiesScreen> {
  List<dynamic> _amenities = const [];
  List<dynamic> _bookings = const [];
  Map<String, dynamic>? _slots;
  int? _amenity;
  late String _date = istToday();
  bool _loading = true, _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final a = await app.run((x) => x.amenities());
      final open = a.where((x) => x['active'] == true).toList();
      _amenities = open;
      if (_amenity == null || !open.any((x) => x['id'] == _amenity)) _amenity = open.isEmpty ? null : open.first['id'] as int;
      final res = await Future.wait([
        _amenity == null ? Future.value(null) : app.run((x) => x.slots(_amenity!, _date)),
        app.run((x) => x.bookings()),
      ]);
      _slots = res[0] as Map<String, dynamic>?;
      _bookings = res[1] as List<dynamic>;
      _error = null;
    } catch (e) {
      _error = '$e';
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _act(Future<void> Function() f, String done) async {
    setState(() => _busy = true);
    try {
      await f();
      if (mounted) toast(context, done);
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    }
    _busy = false;
    await _load();
  }

  Future<bool> _confirm(String q) async =>
      await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          content: Text(q),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Cancel booking')),
          ],
        ),
      ) ??
      false;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Amenities')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: _loading && _slots == null && _bookings.isEmpty
              ? ListView(children: const [SizedBox(height: 200), Center(child: CircularProgressIndicator())])
              : _error != null
                  ? ListView(children: [EmptyState(Icons.cloud_off, _error!)])
                  : ListView(padding: const EdgeInsets.all(16), children: [
                      if (_amenities.isEmpty)
                        EmptyState(Icons.event_busy_outlined,
                            app.isAdmin ? 'No amenities yet. Add them on the web dashboard.' : 'No amenities are open for booking yet.')
                      else ...[
                        DropdownButtonFormField<int>(
                          key: ValueKey('amenity-$_amenity'),
                          initialValue: _amenities.any((a) => a['id'] == _amenity) ? _amenity : null,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Amenity', prefixIcon: Icon(Icons.event_available_outlined)),
                          items: [
                            for (final a in _amenities) DropdownMenuItem<int>(value: a['id'] as int, child: Text('${a['name']}', overflow: TextOverflow.ellipsis)),
                          ],
                          onChanged: (v) {
                            if (v == null || v == _amenity) return;
                            _amenity = v;
                            _load();
                          },
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          height: 40,
                          child: ListView(scrollDirection: Axis.horizontal, children: [
                            for (var i = 0; i < 14; i++)
                              Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: ChoiceChip(
                                  label: Text(i == 0 ? 'Today' : dayLabel(addDays(istToday(), i))),
                                  selected: _date == addDays(istToday(), i),
                                  onSelected: (_) {
                                    _date = addDays(istToday(), i);
                                    _load();
                                  },
                                ),
                              ),
                          ]),
                        ),
                        const SizedBox(height: 12),
                        if (_slots != null) _slotCard(_slots!),
                      ],
                      const SizedBox(height: 20),
                      Text(app.isAdmin ? 'Upcoming bookings' : "Your flat's bookings", style: sectionStyle),
                      const SizedBox(height: 8),
                      if (_bookings.isEmpty) const Text('No upcoming bookings.', style: TextStyle(color: Colors.black54)),
                      for (final b in _bookings)
                        Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            leading: const Icon(Icons.event_available_outlined, color: Palette.accent700),
                            title: Text('${b['amenity']} · ${b['start']}–${b['end_at']}'),
                            subtitle: Text([dayLabel(b['date'] as String), if (app.isAdmin) 'Flat ${b['flat']}'].join(' · ')),
                            trailing: IconButton(
                              tooltip: 'Cancel booking',
                              icon: const Icon(Icons.close),
                              onPressed: _busy
                                  ? null
                                  : () async {
                                      if (await _confirm('Cancel ${b['amenity']} on ${dayLabel(b['date'] as String)} at ${b['start']}?')) {
                                        await _act(() => app.run((x) => x.cancelBooking(b['id'] as int)), 'Booking cancelled');
                                      }
                                    },
                            ),
                          ),
                        ),
                    ]),
        ),
      );

  Widget _slotCard(Map<String, dynamic> s) {
    final a = s['amenity'] as Map;
    final slots = (s['slots'] as List).cast<Map>();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${a['name']} · ${dayLabel(_date)}', style: sectionStyle),
          Text('${a['open_from']}–${a['open_to']}${a['capacity'] != null ? ' · up to ${a['capacity']} people' : ''}',
              style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 12),
          // Two slots per row, filling the card.
          LayoutBuilder(builder: (context, c) {
            final w = (c.maxWidth - 8) / 2;
            return Wrap(spacing: 8, runSpacing: 8, children: [for (final x in slots) SizedBox(width: w, child: _slot(x))]);
          }),
          if (app.isResident) ...[
            const SizedBox(height: 10),
            const Text('Up to 2 upcoming bookings per amenity for your flat.', style: TextStyle(color: Colors.black54, fontSize: 13)),
          ],
        ]),
      ),
    );
  }

  Widget _slot(Map s) {
    final status = s['status'] as String, past = s['past'] == true;
    final mine = status == 'mine', free = status == 'free' && !past;
    final label = mine ? 'Yours' : status == 'taken' ? (app.isAdmin && s['flat'] != null ? 'Flat ${s['flat']}' : 'Booked') : past ? 'Past' : app.isResident ? 'Book' : 'Free';
    return SizedBox(
      child: Material(
        color: mine ? Palette.accent : (free ? Palette.surface : Palette.bg),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: free ? Palette.accent100 : Colors.transparent)),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: _busy
              ? null
              : free && app.isResident
                  ? () => _act(() async => app.run((x) => x.book(_amenity!, _date, s['start'] as String)), 'Booked ${s['start']}–${s['end']}')
                  : (mine || (app.isAdmin && s['booking_id'] != null)) && !past
                      ? () async {
                          if (await _confirm('Cancel the ${s['start']} booking?')) {
                            await _act(() => app.run((x) => x.cancelBooking(s['booking_id'] as int)), 'Booking cancelled');
                          }
                        }
                      : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${s['start']}–${s['end']}',
                  style: TextStyle(fontWeight: FontWeight.w700, color: mine ? Colors.white : (free ? Palette.text : Colors.black45))),
              Text(label, style: TextStyle(fontSize: 13, color: mine ? Colors.white : (free ? Palette.accent700 : Colors.black45))),
            ]),
          ),
        ),
      ),
    );
  }
}
