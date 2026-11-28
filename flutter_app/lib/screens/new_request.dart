import 'package:material_ui/material_ui.dart';
import 'package:image_picker/image_picker.dart';

import '../app_state.dart';
import '../theme.dart';

class NewRequestScreen extends StatefulWidget {
  const NewRequestScreen({super.key, this.category});
  final String? category;
  @override
  State<NewRequestScreen> createState() => _NewRequestScreenState();
}

class _NewRequestScreenState extends State<NewRequestScreen> {
  late String? _category = widget.category;
  final _title = TextEditingController();
  final _description = TextEditingController();
  XFile? _photo;
  bool _busy = false;

  Future<void> _pick(ImageSource source) async {
    final f = await ImagePicker().pickImage(source: source, maxWidth: 1600, imageQuality: 80);
    if (f != null) setState(() => _photo = f);
  }

  Future<void> _submit() async {
    if (_category == null || _title.text.trim().isEmpty) {
      toast(context, 'Choose a category and write a short title', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final bytes = _photo == null ? null : await _photo!.readAsBytes();
      final id = await app.run((a) => a.createRequest(
            category: _category!,
            title: _title.text.trim(),
            description: _description.text.trim(),
            photoBytes: bytes,
            photoName: _photo?.name,
          ));
      if (!mounted) return;
      toast(context, 'Request #$id sent to the committee');
      Navigator.pop(context, id);
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('New request')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('What is it about?', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: categories.any((c) => c.$1 == _category) ? _category : null,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Category'),
            hint: const Text('Choose a category'),
            items: [
              for (final c in categories)
                DropdownMenuItem<String>(
                  value: c.$1,
                  child: Row(children: [Icon(c.$3, size: 18), const SizedBox(width: 10), Text(c.$2)]),
                ),
            ],
            onChanged: (v) => setState(() => _category = v),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _title,
            maxLength: 120,
            decoration: const InputDecoration(labelText: 'Short title', hintText: 'e.g. Kitchen tap is leaking'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _description,
            maxLines: 4,
            maxLength: 2000,
            decoration: const InputDecoration(labelText: 'Details (optional)'),
          ),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                  onPressed: () => _pick(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Camera')),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                  onPressed: () => _pick(ImageSource.gallery),
                  icon: const Icon(Icons.photo_outlined),
                  label: const Text('Gallery')),
            ),
          ]),
          if (_photo != null)
            ListTile(
              leading: const Icon(Icons.image_outlined, color: Palette.accent700),
              title: Text(_photo!.name, maxLines: 1, overflow: TextOverflow.ellipsis),
              trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _photo = null)),
            ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy ? const CircularProgressIndicator() : const Text('Send request'),
          ),
        ]),
      );
}
