import 'package:material_ui/material_ui.dart';

import 'app_state.dart';
import 'screens/login.dart';
import 'screens/shell.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  app.restore();
  runApp(const SahyadriApp());
}

class SahyadriApp extends StatelessWidget {
  const SahyadriApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Sahyadri Heights',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: ListenableBuilder(
          listenable: app,
          builder: (context, _) {
            if (app.restoring) {
              return const Scaffold(body: Center(child: CircularProgressIndicator()));
            }
            return app.user == null ? const LoginScreen() : const Shell();
          },
        ),
      );
}
